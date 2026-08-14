var SpotiSync = SpotiSync || {};

(function (ns) {
  'use strict';

  function applyPlan(job, plan, runtime) {
    var removeBatches = ns.Core.chunk(plan.remove, ns.Constants.WRITE_BATCH_SIZE);
    var addUris = plan.add.map(function (track) { return track.writeUri; });
    var addBatches;

    removeBatches.forEach(function (batch) {
      ns.SpotifyApi.removePlaylistItems(job.targetPlaylist, batch);
    });

    if (plan.addMode === 'FRONT') {
      addBatches = ns.Core.frontInsertionBatches(addUris, ns.Constants.WRITE_BATCH_SIZE);
      addBatches.forEach(function (batch) {
        ns.SpotifyApi.addPlaylistItems(job.targetPlaylist, batch, 0);
      });
    } else {
      addBatches = ns.Core.chunk(addUris, ns.Constants.WRITE_BATCH_SIZE);
      addBatches.forEach(function (batch) {
        ns.SpotifyApi.addPlaylistItems(job.targetPlaylist, batch, null);
      });
    }

    if (removeBatches.length || addBatches.length) {
      ns.Sources.invalidatePlaylist(job.targetPlaylist, runtime);
    }
  }

  function planJob(job, runtime) {
    var source = ns.Sources.getForJob(job, runtime);
    var target = ns.Sources.getTargetPlaylist(job.targetPlaylist, runtime);
    var plan = ns.Strategies.plan(job.strategy, source, target);

    return {
      source: source,
      target: target,
      plan: plan
    };
  }

  function executeJob(job, runtime, write) {
    var startedAt = Date.now();
    var planned = planJob(job, runtime);
    var plan = planned.plan;
    var summary = {
      job: job.name,
      strategy: job.strategy,
      added: plan.add.length,
      removed: plan.removeCount === undefined ? plan.remove.length : plan.removeCount,
      ignored: plan.ignored,
      sourceCount: planned.source.tracks.length,
      targetCount: planned.target.tracks.length,
      status: write ? 'Success' : 'Preview',
      durationMs: 0
    };

    if (write) {
      applyPlan(job, plan, runtime);
    }

    summary.durationMs = Date.now() - startedAt;
    return summary;
  }

  function runInternal(options) {
    var opts = options || {};
    var now = new Date();
    var runtime = { sourceCache: Object.create(null) };
    var readResult = ns.SheetStore.getJobReadResult();
    var configurationErrors = readResult.errors;
    var jobs = readResult.jobs.filter(function (job) {
      return job.enabled && (!opts.dueOnly || ns.SheetStore.isJobDue(job, now));
    });
    var result = {
      jobs: [],
      added: 0,
      removed: 0,
      likedCount: 0,
      status: configurationErrors.length ? 'Partial failure' : 'Success',
      finishedAt: '',
      errors: []
    };

    configurationErrors.forEach(function (configError) {
      result.errors.push(configError.name + ': ' + configError.error);
      result.jobs.push({
        job: configError.name,
        strategy: configError.strategy || '',
        added: 0,
        removed: 0,
        ignored: 0,
        status: 'Configuration error',
        durationMs: 0,
        error: configError.error
      });

      if (opts.write) {
        ns.SheetStore.updateConfigurationError(configError);
        ns.SheetStore.appendHistory({
          timestamp: new Date(),
          job: configError.name,
          strategy: configError.strategy || '',
          added: 0,
          removed: 0,
          ignored: 0,
          status: 'Configuration error',
          durationMs: 0,
          error: configError.error
        });
      }
    });

    jobs.forEach(function (job) {
      var startedAt = Date.now();
      try {
        var summary = executeJob(job, runtime, Boolean(opts.write));
        result.jobs.push(summary);
        result.added += summary.added;
        result.removed += summary.removed;
        if (job.sourceType === ns.Constants.SOURCE_TYPES.LIKED_SONGS) {
          result.likedCount = Math.max(result.likedCount, summary.sourceCount);
        }

        if (opts.write) {
          ns.SheetStore.updateJobSuccess(job, summary);
          ns.SheetStore.appendHistory({
            timestamp: new Date(),
            job: job.name,
            strategy: job.strategy,
            added: summary.added,
            removed: summary.removed,
            ignored: summary.ignored,
            status: 'Success',
            durationMs: summary.durationMs,
            error: ''
          });
        }
      } catch (error) {
        var safeMessage = ns.Core.safeErrorMessage(error);
        result.status = 'Partial failure';
        result.errors.push(job.name + ': ' + safeMessage);
        result.jobs.push({
          job: job.name,
          strategy: job.strategy,
          added: 0,
          removed: 0,
          ignored: 0,
          status: 'Error',
          durationMs: Date.now() - startedAt,
          error: safeMessage
        });

        if (opts.write) {
          ns.SheetStore.updateJobError(job, error);
          ns.SheetStore.appendHistory({
            timestamp: new Date(),
            job: job.name,
            strategy: job.strategy,
            added: 0,
            removed: 0,
            ignored: 0,
            status: 'Error',
            durationMs: Date.now() - startedAt,
            error: safeMessage
          });
        }
      }
    });

    result.finishedAt = ns.Core.nowIso();
    if (opts.write) {
      if (!jobs.length && !configurationErrors.length) {
        result.status = opts.dueOnly ? 'No jobs due' : 'No enabled jobs';
      }
      ns.SheetStore.setRunSummary(result);
    }
    return result;
  }

  ns.SyncEngine = {
    previewEnabled: function () {
      return runInternal({ dueOnly: false, write: false });
    },

    runNow: function () {
      return ns.SyncEngine.withWriteLock(function () {
        return runInternal({ dueOnly: false, write: true });
      });
    },

    runDue: function () {
      return ns.SyncEngine.withWriteLock(function () {
        return runInternal({ dueOnly: true, write: true });
      });
    },

    withWriteLock: function (callback) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(5000)) {
        throw new Error('Another Spoti Sync run is already in progress. Try again after it finishes.');
      }
      try {
        return callback();
      } finally {
        lock.releaseLock();
      }
    },

    _executeJob: executeJob,
    _planJob: planJob
  };
})(SpotiSync);
