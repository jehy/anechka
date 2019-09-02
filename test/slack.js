/* eslint-disable no-underscore-dangle */

'use strict';

const rewire = require('rewire');
const {assert} = require('chai');
const Debug = require('debug');
const sinon = require('sinon');
const clone = require('stringify-clone');

Debug.enable('anechka:test');

const slack = rewire('../modules/slack');

const mockData = require('./mockData/index');
const {
  bunyanMock,
  logMock,
  fsMock,
  testConfigTasks,
} = require('./utils');

function getSlackBotMock({topicValue}) {
  return {
    conversations: {
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

const cachesDefault = {
  users: mockData.spreadsheets.usersExpected,
  timeTables: mockData.spreadsheets.timetableExpected,
  slackUsers: mockData.slack.usersExpected,
  slackTopic: {},
  tasks: testConfigTasks,
  conversations: mockData.slack.conversationsExpected,
};

let adminWarnings = [];

function notifyAdminMock(text) {
  adminWarnings.push(text);
}

describe('slack module', ()=>{
  let revertSlackBot;
  let revertFs;
  let revertBunyan;
  let revertLog;
  let clock;
  let revertConfig;
  let revertNotifyAdmin;
  const topicForReplace = 'The master is <@U02C2K9UR> and the slave is <@U02K307KL>';

  before(()=>{
    revertSlackBot = slack.__set__('initSlack', ()=>{});
    revertNotifyAdmin = slack.__set__('notifyAdmin', notifyAdminMock);
    revertFs = slack.__set__('fs', fsMock);
    revertBunyan = slack.__set__('bunyan', bunyanMock);
    revertLog = slack.__set__('log', logMock);
    clock = sinon.useFakeTimers({ now: new Date(2019, 4, 1, 0, 0)});
    revertConfig = slack.__set__('config', {tasks: testConfigTasks});
  });
  after(()=>{
    revertSlackBot();
    revertFs();
    revertBunyan();
    revertLog();
    clock.restore();
    revertConfig();
    revertNotifyAdmin();
  });
  describe('slack users updater', ()=>{

    let revertBot;
    let revertCaches;
    let caches;
    before(()=>{
      const slackBotMock = getSlackBotMock({topicValue: topicForReplace});
      revertBot = slack.__set__('slackBot', slackBotMock);
    });
    after(()=>{
      revertBot();
    });
    beforeEach(()=>{
      caches = clone(cachesDefault);
      caches.slackUsers = {};
      revertCaches = slack.__set__('caches', caches);
      adminWarnings = [];
    });
    afterEach(()=>{
      revertCaches();
    });
    it('should update slack users', async ()=>{
      const res = await slack.fetchSlackUsers();
      assert.equal(res, true);
      caches.slackUsers.lastUpdate = mockData.slack.usersExpected.lastUpdate; // to avoid messing with timestamps
      assert.deepEqual(caches.slackUsers, mockData.slack.usersExpected);
    });
  });

  describe('updating slack topic', ()=>{
    describe('when topic changes', ()=>{
      let revertBot;
      let revertCaches;
      beforeEach(()=>{
        revertCaches = slack.__set__('caches', clone(cachesDefault));
        adminWarnings = [];
      });
      afterEach(()=>{
        revertCaches();
      });
      before(()=>{
        const slackBotMock = getSlackBotMock({topicValue: topicForReplace});
        revertBot = slack.__set__('slackBot', slackBotMock);

      });
      after(()=>{
        revertBot();
      });
      it('should update slack topic', async ()=>{
        const res = await slack.updateSlack();
        assert.deepEqual(res, [true]);
      });
    });

    describe('when topic stays same', ()=>{
      let revertBot;
      let revertCaches;
      beforeEach(()=>{
        revertCaches = slack.__set__('caches', clone(cachesDefault));
        adminWarnings = [];
      });
      afterEach(()=>{
        revertCaches();
      });
      before(()=>{
        const sameTopic = 'The master is <@U02C2K9UR> and the slave is <@U02C2K9UR>';
        const slackBotMock = getSlackBotMock({topicValue: sameTopic});
        revertBot = slack.__set__('slackBot', slackBotMock);

      });
      after(()=>{
        revertBot();
      });
      it('should not update slack topic', async ()=>{
        const res = await slack.updateSlack();
        assert.deepEqual(res, false);
      });
    });

    describe('when topic has no developer links', ()=>{
      let revertBot;
      let revertCaches;
      beforeEach(()=>{
        revertCaches = slack.__set__('caches', clone(cachesDefault));
        adminWarnings = [];
      });
      afterEach(()=>{
        revertCaches();
      });
      before(()=>{
        const topicValue = 'No master, no slave, just freedom!';
        const slackBotMock = getSlackBotMock({topicValue});
        revertBot = slack.__set__('slackBot', slackBotMock);
      });
      after(()=>{
        revertBot();
      });
      // eslint-disable-next-line sonarjs/no-duplicate-string
      it('should not update slack topic, send warning', async ()=>{
        const res = await slack.updateSlack();
        assert.deepEqual(res, false);
        const lastWarning = adminWarnings[adminWarnings.length - 1];
        assert.equal(lastWarning, 'users not found in topic "No master, no slave, just freedom!" '
          + 'for task "test 1 channel update" (No users notified)');
      });
    });

    describe('when topic has no developer link with needed position', ()=>{
      let revertBot;
      let revertCaches;
      beforeEach(()=>{
        revertCaches = slack.__set__('caches', clone(cachesDefault));
        adminWarnings = [];
      });
      afterEach(()=>{
        revertCaches();
      });
      before(()=>{
        const topicValue = 'The master is <@U02C2K9UR> and the slave is NONE';
        const slackBotMock = getSlackBotMock({topicValue});
        revertBot = slack.__set__('slackBot', slackBotMock);
      });
      after(()=>{
        revertBot();
      });
      // eslint-disable-next-line sonarjs/no-duplicate-string
      it('should not update slack topic, send warning', async ()=>{
        const res = await slack.updateSlack();
        assert.deepEqual(res, false);
        const lastWarning = adminWarnings[adminWarnings.length - 1];
        assert.equal(lastWarning, 'user with index "1" not found in topic "The master is <@U02C2K9UR>'
          + ' and the slave is NONE" for task "test 1 channel update"! (No users notified)');
      });
    });

    describe('when there is no timetable for this month', ()=>{
      let revertBot;
      let revertCaches;
      beforeEach(()=>{
        const caches = clone(cachesDefault);
        caches.timeTables.id['2019']['5'] = undefined;
        revertCaches = slack.__set__('caches', caches);
        adminWarnings = [];
      });
      afterEach(()=>{
        revertCaches();
      });
      before(()=>{
        const slackBotMock = getSlackBotMock({topicValue: topicForReplace});
        revertBot = slack.__set__('slackBot', slackBotMock);
      });
      after(()=>{
        revertBot();
      });
      it('should not update slack topic, send warning', async ()=>{
        const res = await slack.updateSlack();
        assert.deepEqual(res, false);
        const lastWarning = adminWarnings[adminWarnings.length - 1];
        assert.equal(lastWarning, 'There is no timetable for month 5 for task'
          + ' "test 1 channel update" on conversation #test1 (No users notified)');
      });
    });

    describe('when there is no such user in slack', ()=>{
      let revertBot;
      let revertCaches;
      beforeEach(()=>{
        const caches = clone(cachesDefault);
        caches.slackUsers = {};
        revertCaches = slack.__set__('caches', caches);
        adminWarnings = [];
      });
      afterEach(()=>{
        revertCaches();
      });
      before(()=>{
        const slackBotMock = getSlackBotMock({topicValue: topicForReplace});
        revertBot = slack.__set__('slackBot', slackBotMock);
      });
      after(()=>{
        revertBot();
      });
      it('should not update slack topic, send warning', async ()=>{
        const res = await slack.updateSlack();
        assert.deepEqual(res, false);
        const lastWarning = adminWarnings[adminWarnings.length - 1];
        assert.equal(lastWarning, 'Developer "ivan.ivanov" not found in cache! for task "test 1 channel update" (No users notified)');
      });
    });

    describe('when there is no such user in timetable as in users sheet', ()=>{
      let revertBot;
      let revertCaches;
      beforeEach(()=>{
        const caches = clone(cachesDefault);
        caches.users = {
          id: {
            XXX: 'YYY',
          },
          lastUpdate: '2019-05-14T11:39:32.110Z',
        };
        revertCaches = slack.__set__('caches', caches);
        adminWarnings = [];
      });
      afterEach(()=>{
        revertCaches();
      });
      before(()=>{
        const slackBotMock = getSlackBotMock({topicValue: topicForReplace});
        revertBot = slack.__set__('slackBot', slackBotMock);
      });
      after(()=>{
        revertBot();
      });
      it('should not update slack topic, send warning', async ()=>{
        const res = await slack.updateSlack();
        assert.deepEqual(res, false);
        const lastWarning = adminWarnings[adminWarnings.length - 1];
        assert.equal(lastWarning, 'User not found for name "Ivanov" for task'
          + ' "test 1 channel update" on conversation #test1 (No users notified)');
      });
    });
  });

});
