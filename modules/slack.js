'use strict';

const moment = require('moment');
const config = require('config');
const Debug = require('debug');
const Promise = require('bluebird');
const Slack = require('slack');
const fs = require('fs-extra');

const {
  timeTableHash,
  userTimeTableHash,
} = require('./utils');
const {
  timeTableCache,
  userCache,
  slackUserCache,
} = require('./caches');

const gobalDebug = Debug('anechka:slack');

const slackBot = new Slack({token: config.token});

gobalDebug.enabled = true;

async function updateSlackUsers() {
  if (slackUserCache.lastUpdate && slackUserCache.lastUpdate.isAfter(moment().subtract('1', 'hour')))
  {
    return true;
  }
  gobalDebug('updating slack users');
  const users = await slackBot.users.list();
  if (!users.ok) {
    gobalDebug(`updateSlackUsers error, smth not okay: ${users}`);
    return false;
  }
  users.members.forEach((user) => {
    slackUserCache[user.name] = user.id;
  });
  // debug(`SlackUserCache: ${JSON.stringify(slackUserCache, null, 3)}`);
  await fs.writeJson('./current/slackUsers.json', slackUserCache, {spaces: 3});
  slackUserCache.lastUpdate = moment();
  gobalDebug(`slack users updated: ${true}`);
  return true;
}

async function updateSlackUserName(options) {
  const {
    timetable,
    devName,
  } = options;
  const {group, channel, name} = timetable;
  const localDebug = Debug(`anechka:slack:${name}`);
  localDebug.enabled = true;
  const devIndex = timetable.devIndex || 0;
  let topic;
  if (group)
  {
    const channelData = await slackBot.groups.info({channel: group});
    if (!channelData.ok) {
      localDebug(`updateSlackUserName error, smth not okay: ${channelData}`);
      return false;
    }
    topic = channelData.group.topic.value;
  }
  else {
    const channelData = await slackBot.channels.info({channel});
    if (!channelData.ok) {
      localDebug(`updateSlackUserName error, smth not okay: ${channelData}`);
      return false;
    }
    topic = channelData.channel.topic.value;
  }
  localDebug(`Current topic: ${topic}`);
  const findUsers = /<@[A-Z0-9]+>/g;
  const foundUsers = topic.match(findUsers);
  localDebug(`Found users: ${foundUsers}`);
  if (!foundUsers) {
    localDebug('users not found in topic!');
    return false;
  }
  if (!foundUsers[devIndex]) {
    localDebug(`users with index ${devIndex} not found in topic!`);
    return false;
  }
  const devId = slackUserCache[devName];
  if (!devId) {
    localDebug(`Developer ${devName} not found in cache!`);
    return false;
  }
  const newTopic = topic.replace(foundUsers[devIndex], `<@${devId}>`);
  if (newTopic === topic) {
    localDebug('current dev already set, nothing to do');
    return true;
  }
  localDebug(`Setting topic ${newTopic}`);
  let response;
  if (group)
  {
    response = await slackBot.groups.setTopic({
      channel: group,
      topic: newTopic,
    });
  }
  else
  {
    response = await slackBot.channels.setTopic({
      channel,
      topic: newTopic,
    });
  }
  return response && response.ok === true;
}

async function updateSlackTimetable(timetable) {
  const year = moment().format('Y');
  const month = moment().format('M');
  const day = moment().format('D');
  const {name} = timetable;
  const localDebug = Debug(`anechka:slack:${name}`);
  localDebug.enabled = true;
  const calendar = timeTableCache[timeTableHash(timetable)];
  const users = userCache[userTimeTableHash(timetable)];
  if (!calendar) {
    localDebug(`No calendar data for timetable ${JSON.stringify(timetable, null, 3)}`);
    return false;
  }
  if (!users) {
    localDebug(`No calendar data for timetable ${JSON.stringify(timetable, null, 3)}`);
    return false;
  }
  const updateTime = moment(moment().format(`YYYY-MM-DD ${timetable.updateTime}`), 'YYYY-MM-DD HH:mm:ss');
  localDebug(`Update  time: ${updateTime.format('YYYY-MM-DD HH:mm:ss')}`);
  localDebug(`Current time: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
  const {lastUpdate} = timetable;
  if (lastUpdate) {
    localDebug(`lastUpdate: ${lastUpdate.format('YYYY-MM-DD HH:mm:ss')}`);
  }
  else {
    localDebug('lastUpdate: none');
  }
  const tooEarly = moment().isBefore(updateTime);
  const alreadyUpdated = lastUpdate && lastUpdate.isAfter(updateTime);
  if (lastUpdate && (tooEarly || alreadyUpdated)) {
    localDebug('No need for update.');
    return false;
  }
  localDebug('Need update!');

  let timetableNotFound = false;
  if (!calendar[year])
  {
    localDebug(`There is no timetable for year ${year}!`);
    timetableNotFound = true;
  }
  else if (!calendar[year][month])
  {
    localDebug(`There is no timetable for month ${month}!`);
    timetableNotFound = true;
  }
  else if (!calendar[year][month][day])
  {
    localDebug(`There is no timetable for day ${day}!`);
    timetableNotFound = true;
  }
  if (timetableNotFound)
  {
    timetable.lastUpdate = moment();
    return true;
  }
  const currentDevName = calendar[year][month][day];

  const currentDevSlackName = users[currentDevName];
  if (!currentDevSlackName)
  {
    localDebug(`User not found for name ${currentDevName}`);
    timetable.lastUpdate = moment();
    return true;
  }
  try {
    const options = {
      timetable,
      devName: currentDevSlackName,
    };
    const res = await updateSlackUserName(options);
    if (res) {
      timetable.lastUpdate = moment();
    }
    return res;
  }
  catch (err) {
    localDebug(`Failed to set current dev for channel ${timetable.group}${timetable.channel}: ${err}`);
  }
  localDebug('Updated.');
  return true;
}

async function updateSlack() {
  return Promise.map(config.timetables, timetable=>updateSlackTimetable(timetable), {concurrency: 2});
}

module.exports = {
  updateSlackUsers,
  updateSlack,
};
