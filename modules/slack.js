'use strict';

const moment = require('moment');
const config = require('config');
const Promise = require('bluebird');
const Slack = require('slack');
const fs = require('fs-extra');
const bunyan = require('bunyan');

const log = bunyan.createLogger({name: 'anechka:slack'});

const {
  timeTableHash,
  userTimeTableHash,
} = require('./utils');
const caches = require('./caches');

let slackBot;

function initSlack()
{
  slackBot = new Slack({token: config.token});
}

async function updateSlackUsers() {
  if (caches.slackUsers.lastUpdate && caches.slackUsers.lastUpdate.isAfter(moment().subtract('1', 'hour')))
  {
    return true;
  }
  log.info('updating slack users');
  const users = await slackBot.users.list();
  if (!users.ok) {
    log.warn(`updateSlackUsers error, smth not okay: ${users}`);
    return false;
  }
  users.members.forEach((user) => {
    caches.slackUsers[user.name] = user.id;
  });
  // debug(`SlackUserCache: ${JSON.stringify(slackUserCache, null, 3)}`);
  await fs.writeJson('./current/slackUsers.json', caches.slackUsers, {spaces: 3});
  caches.slackUsers.lastUpdate = moment();
  log.info(`slack users updated: ${true}`);
  return true;
}


/**
 * @typedef {Object} Timetable
 * @property {string} group slack group from config
 * @property {string} channel slack channel from config
 * @property {string} name timetable name from config
 * @property {number} devIndex developer name order in slack topic
 * @property {Date} updateTime last time of update to slack
 *
 */
/**
 *
 * @param {string} devName developer name
 * @param {Timetable} timetable timetable data from config
 * @returns {Promise<boolean>}
 */
async function updateSlackTopicCacheData(timetable, devName) {
  const {group, channel, name} = timetable;
  const localLog = bunyan.createLogger({name: `anechka:slack:${name}`});
  const devIndex = timetable.devIndex || 0;
  let topic;
  if (caches.slackTopic && caches.slackTopic[group || channel])
  {
    topic = caches.slackTopic[group || channel];
  }
  else if (group)
  {
    const channelData = await slackBot.groups.info({channel: group});
    if (!channelData.ok) {
      localLog.warn(`updateSlackTopicCacheData error, smth not okay: ${channelData}`);
      return false;
    }
    topic = channelData.group.topic.value;
  }
  else {
    const channelData = await slackBot.channels.info({channel});
    if (!channelData.ok) {
      localLog.warn(`updateSlackTopicCacheData error, smth not okay: ${channelData}`);
      return false;
    }
    topic = channelData.channel.topic.value;
  }
  localLog.info(`Current topic: ${topic}`);
  const findUsers = /<@[A-Z0-9]+>/g;
  const foundUsers = topic.match(findUsers);
  localLog.info(`Found users: ${foundUsers}`);
  if (!foundUsers) {
    localLog.warn('users not found in topic!');
    return false;
  }
  if (!foundUsers[devIndex]) {
    localLog.warn(`user with index ${devIndex} not found in topic!`);
    return false;
  }
  const devId = caches.slackUsers[devName];
  if (!devId) {
    localLog.warn(`Developer ${devName} not found in cache!`);
    return false;
  }
  const newTopic = topic.replace(foundUsers[devIndex], `<@${devId}>`);
  if (newTopic === topic) {
    localLog.info('current dev already set, nothing to do');
    return true;
  }
  localLog.info(`Setting topic in cache to ${newTopic}`);
  caches.slackTopic[group || channel] = newTopic;
  await fs.writeJson('./current/slackTopic.json', caches.slackTopic, {spaces: 3});
  return true;
}


/**
 *
 * @param {Timetable} timetable
 * @returns {boolean}
 */

function shouldUpdate(timetable) {
  const {name, lastUpdate} = timetable;
  const localLog = bunyan.createLogger({name: `anechka:slack:${name}`});
  const updateTime = moment(moment().format(`YYYY-MM-DD ${timetable.updateTime}`), 'YYYY-MM-DD HH:mm:ss');
  localLog.info(`Update  time: ${updateTime.format('YYYY-MM-DD HH:mm:ss')}`);
  localLog.info(`Current time: ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
  if (lastUpdate) {
    localLog.info(`lastUpdate: ${lastUpdate.format('YYYY-MM-DD HH:mm:ss')}`);
  } else {
    localLog.info('lastUpdate: none');
  }
  const tooEarly = moment().isBefore(updateTime);
  const alreadyUpdated = lastUpdate && lastUpdate.isAfter(updateTime);
  if (lastUpdate && (tooEarly || alreadyUpdated)) {
    localLog.info('No need for update.');
    return false;
  }
  localLog.info('Need update!');
  return true;
}

/**
 *
 * @param {Timetable} timetable
 * @returns {boolean}
 */

function getDevName(timetable) {
  const year = moment().format('Y');
  const month = moment().format('M');
  const day = moment().format('D');
  const {name} = timetable;
  const localLog = bunyan.createLogger({name: `anechka:slack:${name}`});
  const calendar = caches.timeTables[timeTableHash(timetable)];
  const users = caches.users[userTimeTableHash(timetable)];

  if (!calendar[year])
  {
    localLog.warn(`There is no timetable for year ${year}!`);
    return false;
  }
  if (!calendar[year][month])
  {
    localLog.warn(`There is no timetable for month ${month}!`);
    return false;
  }
  if (!calendar[year][month][day])
  {
    localLog.warn(`There is no timetable for day ${day}!`);
    return false;
  }
  const currentDevName = calendar[year][month][day];
  if (!currentDevName)
  {
    localLog.info(`User not found for ${day}.${month}.${year}, holiday?`);
    return true;
  }

  const currentDevSlackName = users[currentDevName];
  if (!currentDevSlackName)
  {
    localLog.warn(`User not found for name ${currentDevName}`);
    return false;
  }
  return currentDevSlackName;
}

async function updateChannelTopic(channelId, newTopic)
{
  let name;
  let group;
  let channel;
  try {
    const found = config.timetables.find(timetable=>timetable.group === channelId || timetable.channel === channelId);
    name = found.name;
    group = found.group;
    channel = found.channel;
  }
  catch (err)
  {
    log.warn(`${channelId} is neither group or channel, check config!`);
    return;
  }
  const localLog = bunyan.createLogger({name: `anechka:slack:${name}`});
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
  const updated = response && response.ok === true;
  localLog.info(`${channelId} updated to ${newTopic}: ${updated}`);
}

async function updateSlack() {
  await Promise.map(config.timetables, (timetable)=> {
    if (shouldUpdate(timetable))
    {
      const devName = getDevName(timetable);
      if (devName && devName !== true)
      {
        return updateSlackTopicCacheData(timetable, devName);
      }
    }
    return true;
  }, {concurrency: 1});
  const updateTopics = Object.entries(caches.slackTopic);
  if (!updateTopics.length)
  {
    log.info('No caches to update');
    config.timetables.forEach((timetable)=>{
      timetable.lastUpdate = moment();
    });
    return false;
  }
  const res =  Promise.map(updateTopics, async ([channelId, newTopic])=>updateChannelTopic(channelId, newTopic), {concurrency: 1});
  config.timetables.forEach((timetable)=>{
    timetable.lastUpdate = moment();
  });
  caches.slackTopic = {};
  return res;
}

module.exports = {
  updateSlackUsers,
  updateSlack,
  initSlack,
};
