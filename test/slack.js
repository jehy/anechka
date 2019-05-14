/* eslint-disable no-underscore-dangle */

'use strict';

const rewire = require('rewire');
const config = require('config');
const {assert} = require('chai');
const Debug = require('debug');

const debug = Debug('anechka:test');
Debug.enable('anechka:test');

const slack = rewire('../modules/slack');

const mockData = require('./mockData/index');
const {logMock, fsMock, testConfigTimetables} = require('./utils');

const slackBotMock =  {
  groups: {
    setTopic: ()=>({ok: true}),
  },
  channels: {
    setTopic: ()=>({ok: true}),
  },
  users: {
    list: ()=>mockData.slack.users,
  },
};

describe('slack module', ()=>{
  let revertSlackBot;
  let revertConfig;
  let revertFs;
  let revertCaches;
  let revertLogger;
  let revertBot;
  const caches = {users: {}, timeTables: {}, slackUsers: {}};
  before(()=>{
    revertSlackBot = slack.__set__('initSlack', ()=>{});
    revertLogger = slack.__set__('log', logMock);
    config.timetables = testConfigTimetables;
    revertFs = slack.__set__('fs', fsMock);
    revertConfig = slack.__set__('config', {timetables: testConfigTimetables});
    revertCaches = slack.__set__('caches', caches);
    revertBot = slack.__set__('slackBot', slackBotMock);
  });
  after(()=>{
    revertSlackBot();
    revertFs();
    revertConfig();
    revertCaches();
    revertLogger();
    revertBot();
  });
  it('should update slack users', async ()=>{
    const res = await slack.updateSlackUsers();
    assert.equal(res, true);
    caches.slackUsers.lastUpdate = mockData.slack.usersExpected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.slackUsers, mockData.slack.usersExpected);
  });
  xit('should update slack info', async ()=>{
    const res = await slack.updateSlack();
    assert.equal(res, true);
    caches.timeTables.lastUpdate = mockData.spreadsheets.timetableExpected.lastUpdate; // to avoid messing with timestamps
    assert.deepEqual(caches.timeTables, mockData.spreadsheets.timetableExpected);
  });

});
