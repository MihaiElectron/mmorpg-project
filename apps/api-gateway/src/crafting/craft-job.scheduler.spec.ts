import { CraftJobScheduler, CRAFT_JOB_COMPLETION_BATCH } from './craft-job.scheduler';
import { CraftJobState } from './entities/craft-job.entity';

describe('CraftJobScheduler', () => {
  let scheduler: CraftJobScheduler;
  let mockService: { findDueJobIds: jest.Mock; complete: jest.Mock };

  beforeEach(() => {
    mockService = {
      findDueJobIds: jest.fn().mockResolvedValue([]),
      complete: jest.fn(),
    };
    scheduler = new CraftJobScheduler(mockService as any);
    jest.spyOn(scheduler['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(scheduler['logger'], 'debug').mockImplementation(() => undefined);
    jest.spyOn(scheduler['logger'], 'error').mockImplementation(() => undefined);
  });

  it('sélectionne les jobs dus avec un batch borné', async () => {
    await scheduler.handleDueJobs();
    expect(mockService.findDueJobIds).toHaveBeenCalledWith(expect.any(Date), CRAFT_JOB_COMPLETION_BATCH);
  });

  it('ne complète rien quand aucun job n’est dû', async () => {
    mockService.findDueJobIds.mockResolvedValue([]);
    await scheduler.handleDueJobs();
    expect(mockService.complete).not.toHaveBeenCalled();
  });

  it('complète chaque job dû', async () => {
    mockService.findDueJobIds.mockResolvedValue(['job-1', 'job-2']);
    mockService.complete
      .mockResolvedValueOnce({ jobId: 'job-1', state: CraftJobState.COMPLETED, successes: 1, failures: 0 })
      .mockResolvedValueOnce({ jobId: 'job-2', state: CraftJobState.FAILED, successes: 0, failures: 1 });

    await scheduler.handleDueJobs();

    expect(mockService.complete).toHaveBeenCalledTimes(2);
    expect(mockService.complete).toHaveBeenCalledWith('job-1');
    expect(mockService.complete).toHaveBeenCalledWith('job-2');
  });

  it('une erreur sur un job n’interrompt pas le batch', async () => {
    mockService.findDueJobIds.mockResolvedValue(['job-1', 'job-2', 'job-3']);
    mockService.complete
      .mockResolvedValueOnce({ jobId: 'job-1', state: CraftJobState.COMPLETED, successes: 1, failures: 0 })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ jobId: 'job-3', state: CraftJobState.COMPLETED, successes: 1, failures: 0 });

    await scheduler.handleDueJobs();

    expect(mockService.complete).toHaveBeenCalledTimes(3);
  });

  it('gère un skip idempotent (complete renvoie null)', async () => {
    mockService.findDueJobIds.mockResolvedValue(['job-1']);
    mockService.complete.mockResolvedValueOnce(null);

    await expect(scheduler.handleDueJobs()).resolves.toBeUndefined();
  });

  it('n’échoue pas si la lecture des jobs dus lève une erreur', async () => {
    mockService.findDueJobIds.mockRejectedValueOnce(new Error('db down'));
    await expect(scheduler.handleDueJobs()).resolves.toBeUndefined();
    expect(mockService.complete).not.toHaveBeenCalled();
  });
});
