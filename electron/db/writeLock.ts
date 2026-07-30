// 串行化所有云端写入，避免并发 push 触发 InnoDB 死锁
let writeChain: Promise<void> = Promise.resolve();

export async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(() => fn());
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const DEADLOCK_ERRNO = 1213;

export async function withDeadlockRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errno = (error as { errno?: number }).errno;
      if (errno !== DEADLOCK_ERRNO || attempt >= maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 * attempt));
    }
  }
  throw lastError;
}
