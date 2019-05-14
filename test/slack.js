/* eslint-disable no-underscore-dangle */

'use strict';

const rewire = require('rewire');
const config = require('config');
const {assert} = require('chai');
const Debug = require('debug');
const sinon = require('sinon');

const debug = Debug('anechka:test');
Debug.enable('anechka:test');

const slack = rewire('../modules/slack');

const mockData = require('./mockData/index');
const {logMock, fsMock, testConfigTimetables} = require('./utils');

function getSlackBotMock({topicValue}) {
  return {
    groups: {
      setTopic: () => ({ok: true}),
      info: () => ({
        ok: true,
        group: {topic: {value: topicValue}},
      }),
    },
    channels: {
      setTopic: () => ({ok: true}),
      info: () => ({
        ok: true,
        channel: {topic: {value: topicValue}},
      }),
    },
    users: {
      list: () => mockData.slack.users,
    },
  };
}

class bunyanMock
{
  static createLogger()
  {
    return logMock;
  }
}

describe('slack module', ()=>{
  let revertSlackBot;
  let revertConfig;
  let revertFs;
  let revertCaches;
  let revertLogger;
  let revertBot;
  let revertBunyan;
  let clock;
  const caches = {
    users: mockData.spreadsheets.usersExpected,
    timeTables: mockData.spreadsheets.timetableExpected,
    slackUsers: {},
    slackTopic: {},
  };
  before(()=>{
    revertSlackBot = slack.__set__('initSlack', ()=>{});
    revertLogger = slack.__set__('log', logMock);
    config.timetables = testConfigTimetables;
    revertFs = slack.__set__('fs', fsMock);
    revertFs = slack.__set__('fs', fsMock);
    revertBunyan = slack.__set__('bunyan', bunyanMock);
    revertConfig = slack.__set__('config', {timetables: testConfigTimetables});
    revertCaches = slack.__set__('caches', caches);
    const topicValue = 'The master is <@U02C2K9UR> and the slave is <@U02K307KL>';
    const slackBotMock = getSlackBotMock({topicValue});
    revertBot = slack.__set__('slackBot', slackBotMock);
    clock = sinon.useFakeTimers({ now: new Date(2019, 4, 1, 0, 0)});
  });
  after(()=>{
    revertSlackBot();
    revertFs();
    revertConfig();
    revertCaches();
    revertLogger();
    revertBot();
    revertBunyan();
    clock.restore();
  });
  it('should update slack users', async ()=>{
    const res = await slack.updateSlackUsers();
    assert.equal(res, true);
    caches.slackUsers.lastUpdate = mockData.slack.usersExpected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.slackUsers, mockData.slack.usersExpected);
  });
  it('should update slack info when everuthing is fine', async ()=>{
    const res = await slack.updateSlack();
    assert.deepEqual(res, [true]);
  });

});
