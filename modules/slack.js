'use strict';

const moment = require('moment');
const config = require('config');
const Promise = require('bluebird');
const Slack = require('slack');
const fs = require('fs-extra');
const bunyan = require('bunyan');
const clone = require('stringify-clone');

const {
  timeTableHash,
  userTimeTableHash,
} = require('./utils');
const caches = require('./caches');

let slackBot;
let init;
let log;

let userFetchedResolve;
let usersFetched = new Promise((resolve)=>{ userFetchedResolve = resolve; });

/* istanbul ignore next */
async function notifyAdmin(text)
{
  if (!config.admin)
  {
    log.warn('Failed to post message to admin, admin login not set');
    return;
  }
  await usersFetched;
  let channel = caches.slackUsers[config.admin];
  if (!channel)
  {
    log.warn(`Failed to post message to admin, name "${config.admin}" not found`);
    return;
  }
  try {
    await slackBot.chat.postMessage({
      text,
      channel,
      as_user: true,
    });
  }
  catch (err)
  {
    log.error('Failed to post message to admin', err);
  }
}

/* istanbul ignore next */
function initSlack()
{
  if (init)
  {
    return;
  }
  log = bunyan.createLogger({name: 'anechka:slack'});
  slackBot = new Slack({token: config.token});
  caches.tasks = clone(config.tasks);
  notifyAdmin('Anechka started');
  init = true;
}

async function fetchSlackConversations()
{
  if (caches.conversations.lastUpdate && caches.conversations.lastUpdate.isAfter(moment().subtract('1', 'hour')))
  {
    return true;
  }
  log.info('fetching slack conversations');
  const limit = 100;
  const listOptions = {
    exclude_archived: true,
    types: 'public_channel,private_channel',
    limit,
  };
  let reply = await slackBot.conversations.list(listOptions);
  if (!reply.ok)
  {
    log.warn(`Failed to fetch conversions: ${JSON.stringify(reply)}`);
    return false;
  }
  reply.channels.forEach((channel)=>{
    caches.conversations[channel.name] = channel.id;
  });
  let cursor = reply.response_metadata && reply.response_metadata.next_cursor;
  while (cursor)
  {
    log.info(`fetching more slack conversations... (${Object.keys(caches.conversations).length} already)`);
    // eslint-disable-next-line no-await-in-loop
    await Promise.delay(3000);
    listOptions.cursor = cursor;
    // eslint-disable-next-line no-await-in-loop
    reply = await slackBot.conversations.list(listOptions);
    if (!reply.ok)
    {
      log.warn(`Failed to fetch conversions: ${JSON.stringify(reply)}`);
      return false;
    }
    reply.channels.forEach((channel)=>{
      caches.conversations[channel.name] = channel.id;
    });
    cursor = reply.response_metadata.next_cursor;
  }
  await fs.writeJson('./current/conversations.json', caches.conversations, {spaces: 3});
  log.info(`fetched slack conversations (${Object.keys(caches.conversations).length})`);
  caches.conversations.lastUpdate = moment();
  return true;
}

async function fetchSlackUsers() {
  if (caches.slackUsers.lastUpdate && caches.slackUsers.lastUpdate.isAfter(moment().subtract('1', 'hour')))
  {
    return true;
  }
  log.info('fetching slack users');
  const limit = 100;
  const listOptions = {
    limit,
  };
  let reply = await slackBot.users.list(listOptions);
  if (!reply.ok) {
    log.warn(`updateSlackUsers error, smth not okay: ${reply}`);
    return false;
  }
  caches.slackUsers = reply.members
    .filter(user=>!user.deleted)
    .reduce((res, user) => { res[user.name] = user.id; return res; }, {});

  let cursor = reply.response_metadata && reply.response_metadata.next_cursor;
  while (cursor)
  {
    log.info(`fetching more slack users... (${Object.keys(caches.slackUsers).length} already)`);
    // eslint-disable-next-line no-await-in-loop
    await Promise.delay(3000);
    listOptions.cursor = cursor;
    // eslint-disable-next-line no-await-in-loop
    reply = await slackBot.users.list(listOptions);
    if (!reply.ok)
    {
      log.warn(`Failed to fetch users: ${JSON.stringify(reply)}`);
      return false;
    }
    reply.members.forEach((user)=>{
      if (user.deleted)
      {
        return;
      }
      caches.slackUsers[user.name] = user.id;
    });
    cursor = reply.response_metadata.next_cursor;
  }
  // debug(`SlackUserCache: ${JSON.stringify(slackUserCache, null, 3)}`);
  caches.slackUsers.lastUpdate = moment();
  await fs.writeJson('./current/slackUsers.json', caches.slackUsers, {spaces: 3});
  log.info(`slack users fetched: ${true} (${Object.keys(caches.slackUsers).length})`);
  userFetchedResolve();
  return true;
}


/**
 * @typedef {Object} Timetable
 * @property {string} conversation slack group or channel from config
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
  const {conversation, name} = timetable;
  const localLog = bunyan.createLogger({name: `anechka:slack:${name}`});
  const devIndex = timetable.devIndex || 0;
  let topic;
  const channel = caches.conversations[conversation];
  if (!channel)
  {
    const warning = `Can not find conversation with name ${conversation}`;
    localLog.warn(warning);
    notifyAdmin(warning);
    return false;
  }
  if (caches.slackTopic && caches.slackTopic[conversation])
  {
    topic = caches.slackTopic[conversation];
  }
  else {
    const channelData = await slackBot.conversations.info({channel});
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
    const warning = `users not found in topic "${topic}" for task "${name}"`;
    localLog.warn(warning);
    notifyAdmin(warning);
    return false;
  }
  if (!foundUsers[devIndex]) {
    const warning = `user with index "${devIndex}" not found in topic "${topic}" for task "${name}"!`;
    localLog.warn(warning);
    notifyAdmin(warning);
    return false;
  }
  const devId = caches.slackUsers[devName];
  if (!devId) {
    const warning = `Developer "${devName}" not found in cache! for task "${name}"`;
    localLog.warn(warning);
    notifyAdmin(warning);
    return false;
  }
  const newTopic = topic.replace(foundUsers[devIndex], `<@${devId}>`);
  if (newTopic === topic) {
    localLog.info('current dev already set, nothing to do');
    return true;
  }
  localLog.info(`Setting topic in cache to ${newTopic}`);
  caches.slackTopic[conversation] = newTopic;
  await fs.writeJson('./current/slackTopic.json', caches.slackTopic, {spaces: 3});
  return true;
}


/**
 *
 * @param {Timetable} timetable
 * @returns {boolean}
 */

function shouldUpdate(timetable) {
  const dateTimeFormat = 'YYYY-MM-DD HH:mm:ss';
  const {name, lastUpdate} = timetable;
  const localLog = bunyan.createLogger({name: `anechka:slack:${name}`});
  const updateTime = moment(moment().format(`YYYY-MM-DD ${timetable.updateTime}`), dateTimeFormat);
  localLog.info(`Update  time: ${updateTime.format(dateTimeFormat)}`);
  localLog.info(`Current time: ${moment().format(dateTimeFormat)}`);
  if (lastUpdate) {
    localLog.info(`lastUpdate: ${lastUpdate.format(dateTimeFormat)}`);
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

function isHoliday()
{
  const day = moment().isoWeekday();
  return day === 6 || day === 7;
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
  const {name, conversation} = timetable;
  const localLog = bunyan.createLogger({name: `anechka:slack:${name}`});
  const calendar = caches.timeTables[timeTableHash(timetable)];
  const users = caches.users[userTimeTableHash(timetable)];
  const commonLogPart = `for task "${name}" on conversation #${conversation}`;

  if (!calendar[year])
  {
    const warning = `There is no timetable for year ${year} ${commonLogPart}`;
    localLog.warn(warning);
    notifyAdmin(warning);
    return false;
  }
  if (!calendar[year][month])
  {
    const warning = `There is no timetable for month ${month} ${commonLogPart}`;
    localLog.warn(warning);
    notifyAdmin(warning);
    return false;
  }
  if (!calendar[year][month][day])
  {
    const warning = `There is no timetable for day ${day} ${commonLogPart}`;
    localLog.warn(warning);
    if (!isHoliday())
    {
      notifyAdmin(warning);
    }
    return false;
  }
  const currentDevName = calendar[year][month][day];
  if (!currentDevName)
  {
    const warning = `User not found for ${day}.${month}.${year} ${commonLogPart}, holiday?`;
    localLog.info(warning);
    if (!isHoliday())
    {
      notifyAdmin(warning);
    }
    return true;
  }

  const currentDevSlackName = users[currentDevName];
  if (!currentDevSlackName)
  {
    const warning = `User not found for name "${currentDevName}" ${commonLogPart}`;
    localLog.warn(warning);
    notifyAdmin(warning);
    return false;
  }
  return currentDevSlackName;
}

async function updateChannelTopic(conversation, newTopic)
{
  const channel = caches.conversations[conversation];
  if (!channel)
  {
    const warning = `Can not find conversation with name ${conversation}`;
    log.warn(warning);
    notifyAdmin(warning);
    return false;
  }
  const localLog = bunyan.createLogger({name: `anechka:slack:${conversation}`});
  const response = await slackBot.conversations.setTopic({
    channel,
    topic: newTopic,
  });

  const updated = response && response.ok === true;
  localLog.info(`${channel} updated to ${newTopic}: ${updated}`);
  return true;
}

async function updateSlack() {
  await Promise.map(caches.tasks, (timetable)=> {
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
    caches.tasks.forEach((timetable)=>{
      timetable.lastUpdate = moment();
    });
    return false;
  }
  const res =  Promise.map(updateTopics, async ([conversation, newTopic])=>updateChannelTopic(conversation, newTopic), {concurrency: 1});
  caches.tasks.forEach((timetable)=>{
    timetable.lastUpdate = moment();
  });
  caches.slackTopic = {};
  await fs.writeJson('./current/tasks.json', caches.tasks, {spaces: 3});
  return res;
}

module.exports = {
  fetchSlackUsers,
  updateSlack,
  initSlack,
  fetchSlackConversations,
};
