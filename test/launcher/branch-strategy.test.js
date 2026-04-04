const { test, describe } = require('node:test');
const assert = require('node:assert');

const { getBuildBranchName, getMilestoneTagName, getStoryRevertCommand } = require('../../src/launcher/branch-strategy.js');

describe('Branch Strategy', () => {
  test('getBuildBranchName returns rouge/build-{projectName}', () => {
    assert.equal(getBuildBranchName('fleet-manager'), 'rouge/build-fleet-manager');
  });

  test('getBuildBranchName handles spaces and special chars', () => {
    assert.equal(getBuildBranchName('my cool project'), 'rouge/build-my-cool-project');
  });

  test('getMilestoneTagName returns milestone/{name}', () => {
    assert.equal(getMilestoneTagName('vehicle-registry'), 'milestone/vehicle-registry');
  });

  test('getStoryRevertCommand returns git revert for commit range', () => {
    const cmd = getStoryRevertCommand('abc123', 'def456');
    assert.ok(cmd.includes('git revert'));
    assert.ok(cmd.includes('abc123'));
    assert.ok(cmd.includes('def456'));
  });

  test('getStoryRevertCommand handles single commit', () => {
    const cmd = getStoryRevertCommand('abc123');
    assert.ok(cmd.includes('git revert'));
    assert.ok(cmd.includes('abc123'));
  });
});
