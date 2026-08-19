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
    var heartbeat = null;
    var summary = {
      job: job.name,
      jobId: job.jobId,
      strategy: job.strategy,
      added: plan.add.length,
      removed: plan.removeCount === undefined ? plan.remove.length : plan.removeCount,
      ignored: plan.ignored,
      sourceCount: planned.source.tracks.length,
      targetCount: planned.target.tracks.length,
      status: write ? 'Success' : 'Preview',
      warning: '',
      durationMs: 0
    };

    if (write) {
      applyPlan(job, plan, runtime);
      if (job.heartbeatEnabled !== false) {
        heartbeat = ns.PlaylistHeartbeat.update(job, new Date());
        if (!heartbeat.ok) {
          summary.status = 'Success with warning';
          summary.warning = 'Playlist synced, but its Spotify description could not be updated: ' + heartbeat.error;
        }
      }
    }

    summary.durationMs = Date.now() - startedAt;
    return summary;
  }

  function activityDetails(summary) {
    var parts = [];
    if (summary.ignored) {
      parts.push(summary.ignored + ' unsupported item' + (summary.ignored === 1 ? '' : 's') + ' ignored');
    }
    if (summary.warning) {
      parts.push(summary.warning);
    }
    return parts.join(' · ');
  }

  function matchingConfigurationErrors(errors, options) {
    var opts = options || {};
    if (opts.jobId) {
      return errors.filter(function (item) { return item.jobId === opts.jobId; });
    }
    return errors.filter(function (item) { return item.enabled; });
  }

  function isDueInDispatcher(job, options, now) {
    var opts = options || {};
    var current = now || new Date();

    if (!ns.SheetStore.isJobDue(job, current)) {
      return false;
    }

    if (opts.schedulerMode === 'HOURLY' &&
        job.frequencyUnit === ns.Constants.FREQUENCY_UNITS.DAY) {
      return Number(Utilities.formatDate(
        current,
        ns.SheetStore.getSpreadsheetTimezone(),
        'H'
      )) === ns.Constants.DEFAULT_SCHEDULER_HOUR;
    }

    return true;
  }

  function matchingJobs(jobs, options, now) {
    var opts = options || {};
    if (opts.jobId) {
      return jobs.filter(function (job) { return job.jobId === opts.jobId; });
    }
    return jobs.filter(function (job) {
      return job.enabled && (!opts.dueOnly || isDueInDispatcher(job, opts, now));
    });
  }

  function runInternal(options) {
    var opts = options || {};
    var now = new Date();
    var runtime = { sourceCache: Object.create(null) };
    var readResult = ns.SheetStore.getJobReadResult();
    var configurationErrors = matchingConfigurationErrors(readResult.errors, opts);
    var jobs = matchingJobs(readResult.jobs, opts, now);
    var result = {
      jobs: [],
      added: 0,
      removed: 0,
      likedCount: 0,
      status: configurationErrors.length ? 'Partial failure' : 'Success',
      finishedAt: '',
      errors: [],
      warnings: []
    };

    if (opts.jobId && !jobs.length && !configurationErrors.length) {
      throw new Error('Spoti Sync job not found.');
    }

    configurationErrors.forEach(function (configError) {
      result.errors.push(configError.name + ': ' + configError.error);
      result.jobs.push({
        job: configError.name,
        jobId: configError.jobId || '',
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
        ns.SheetStore.appendActivity({
          timestamp: new Date(),
          job: configError.name,
          jobId: configError.jobId || '',
          status: 'Configuration error',
          added: 0,
          removed: 0,
          durationMs: 0,
          details: configError.error
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
        if (summary.warning) {
          result.warnings.push(job.name + ': ' + summary.warning);
          if (result.status === 'Success') {
            result.status = 'Success with warnings';
          }
        }

        if (opts.write) {
          ns.SheetStore.updateJobSuccess(job, summary);
          ns.SheetStore.appendActivity({
            timestamp: new Date(),
            job: job.name,
            jobId: job.jobId,
            status: summary.status,
            added: summary.added,
            removed: summary.removed,
            durationMs: summary.durationMs,
            details: activityDetails(summary)
          });
        }
      } catch (error) {
        var safeMessage = ns.Core.safeErrorMessage(error);
        result.status = 'Partial failure';
        result.errors.push(job.name + ': ' + safeMessage);
        result.jobs.push({
          job: job.name,
          jobId: job.jobId,
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
          ns.SheetStore.appendActivity({
            timestamp: new Date(),
            job: job.name,
            jobId: job.jobId,
            status: 'Error',
            added: 0,
            removed: 0,
            durationMs: Date.now() - startedAt,
            details: safeMessage
          });
        }
      }
    });

    result.finishedAt = ns.Core.nowIso();
    if (opts.write) {
      if (!jobs.length && !configurationErrors.length) {
        result.status = opts.dueOnly ? 'No jobs due' : 'No enabled jobs';
      }
      // An hourly dispatcher can wake with nothing due. That is scheduler
      // telemetry, not a playlist run, so do not overwrite the user's last-run
      // summary on a no-op due check.
      if (!(opts.dueOnly && !jobs.length && !configurationErrors.length)) {
        ns.SheetStore.setRunSummary(result);
      }
    }
    return result;
  }

  function refreshSummaryBestEffort() {
    try {
      ns.SheetStore.refreshSummary();
    } catch (ignored) {
      // Sync correctness must not depend on presentation.
    }
  }

  ns.SyncEngine = {
    previewEnabled: function () {
      return runInternal({ dueOnly: false, write: false });
    },

    runNow: function () {
      return ns.SyncEngine.withWriteLock(function () {
        var result = runInternal({ dueOnly: false, write: true });
        refreshSummaryBestEffort();
        return result;
      });
    },

    runJob: function (jobId) {
      var id = ns.Core.trim(jobId);
      ns.Core.assert(id, 'Job ID is required.');
      return ns.SyncEngine.withWriteLock(function () {
        var result = runInternal({ jobId: id, write: true });
        refreshSummaryBestEffort();
        return result;
      });
    },

    runDue: function (options) {
      var settings = options || {};
      return ns.SyncEngine.withWriteLock(function () {
        return runInternal({
          dueOnly: true,
          write: true,
          schedulerMode: settings.schedulerMode || ''
        });
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
    _planJob: planJob,
    _isDueInDispatcher: isDueInDispatcher,
    _runInternal: runInternal
  };
})(SpotiSync);