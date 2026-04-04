const { test, describe } = require('node:test');
const assert = require('node:assert');

const { checkMilestoneLock, promoteMilestone } = require('../../src/launcher/safety.js');

describe('Milestone Lock', () => {
  test('checkMilestoneLock returns false for unpromoted milestone', () => {
    const checkpoint = { state: { promoted_milestones: ['dashboard'] } };
    assert.equal(checkMilestoneLock(checkpoint, 'gps-trips'), false);
  });

  test('checkMilestoneLock returns true for promoted milestone', () => {
    const checkpoint = { state: { promoted_milestones: ['dashboard', 'gps-trips'] } };
    assert.equal(checkMilestoneLock(checkpoint, 'dashboard'), true);
  });

  test('checkMilestoneLock handles missing promoted_milestones', () => {
    const checkpoint = { state: {} };
    assert.equal(checkMilestoneLock(checkpoint, 'dashboard'), false);
  });

  test('promoteMilestone adds to promoted_milestones array', () => {
    const state = { promoted_milestones: ['dashboard'] };
    promoteMilestone(state, 'gps-trips');
    assert.deepEqual(state.promoted_milestones, ['dashboard', 'gps-trips']);
  });

  test('promoteMilestone creates array if missing', () => {
    const state = {};
    promoteMilestone(state, 'dashboard');
    assert.deepEqual(state.promoted_milestones, ['dashboard']);
  });

  test('promoteMilestone is idempotent', () => {
    const state = { promoted_milestones: ['dashboard'] };
    promoteMilestone(state, 'dashboard');
    assert.deepEqual(state.promoted_milestones, ['dashboard']);
  });
});
