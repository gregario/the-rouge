/**
 * V3 Deploy blocking — retry logic + milestone-check gate.
 * Wraps the existing deploy() function with retry and blocking semantics.
 */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function deployWithRetry(deployFn, opts = {}) {
  const maxRetries = opts.maxRetries || 3;
  const retryDelayMs = opts.retryDelayMs ?? 30000;
  const logger = opts.logger || ((msg) => console.error(`[deploy-retry] ${msg}`));

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = await Promise.resolve(deployFn());
      if (url) {
        return { url, blocked: false, attempts: attempt };
      }
      logger(`Attempt ${attempt}/${maxRetries}: deploy returned null (see deploy log for reason)`);
    } catch (err) {
      lastError = err;
      const detail = (err && (err.stderr || err.message)) || String(err);
      logger(`Attempt ${attempt}/${maxRetries} threw: ${String(detail).slice(0, 400)}`);
    }

    if (attempt < maxRetries && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  const tail = lastError && (lastError.stderr || lastError.message);
  return {
    url: null,
    blocked: true,
    reason: tail
      ? `Staging deploy failed ${maxRetries} times — last error: ${String(tail).slice(0, 200)}`
      : `Staging deploy failed ${maxRetries} times`,
    attempts: maxRetries,
  };
}

function shouldBlockMilestoneCheck(deployResult) {
  if (!deployResult) return true;
  return deployResult.blocked === true;
}

module.exports = { deployWithRetry, shouldBlockMilestoneCheck };
