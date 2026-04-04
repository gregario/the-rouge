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

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = deployFn();
      if (url) {
        return { url, blocked: false, attempts: attempt };
      }
    } catch (err) {
      // Deploy threw — treat as failure
    }

    if (attempt < maxRetries && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  return {
    url: null,
    blocked: true,
    reason: `Staging deploy failed ${maxRetries} times`,
    attempts: maxRetries,
  };
}

function shouldBlockMilestoneCheck(deployResult) {
  if (!deployResult) return true;
  return deployResult.blocked === true;
}

module.exports = { deployWithRetry, shouldBlockMilestoneCheck };
