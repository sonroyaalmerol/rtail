#!/bin/sh
':' // # comment; exec /usr/bin/env node --harmony "$0" "$@"

/*!
 * rtail2-server.js (based on the original rtail-server)
 * Original created by Kilian Ciuffolo
 * Modified by Son Roy Almerol
 */

'use strict'

const dgram = require('dgram')
const fastify = require('fastify')()
const io = require('socket.io')(fastify.server)
const yargs = require('yargs')
const debug = require('debug')('rtail2:server')
const updateNotifier = require('update-notifier')
const pkg = require('../package')
const path = require('path')

/*!
 * inform the user of updates
 */
updateNotifier({
  packageName: pkg.name,
  packageVersion: pkg.version
}).notify()

/*!
 * parsing argv
 */
let argv = yargs
  .usage('Usage: rtail2-server [OPTIONS]')
  .example('rtail2-server --web-port 8080', 'Use custom HTTP port')
  .example('rtail2-server --udp-port 8080', 'Use custom UDP port')
  .option('udp-host', {
    alias: 'uh',
    default: '127.0.0.1',
    describe: 'The listening UDP hostname'
  })
  .option('udp-port', {
    alias: 'up',
    default: 9999,
    describe: 'The listening UDP port'
  })
  .option('web-host', {
    alias: 'wh',
    default: '127.0.0.1',
    describe: 'The listening HTTP hostname'
  })
  .option('web-port', {
    alias: 'wp',
    default: 8888,
    describe: 'The listening HTTP port'
  })
  .option('buffer-size', {
    alias: 'bs',
    default: 100,
    describe: 'The max log buffer size'
  })
  .help('help')
  .alias('help', 'h')
  .version(pkg.version, 'version')
  .alias('version', 'v')
  .strict()
  .argv

/*!
 * UDP sockets setup
 */
let streams = {}
let socket = dgram.createSocket('udp4')

socket.on('message', function (data, remote) {
  // try to decode JSON
  try { data = JSON.parse(data) } catch (err) { return debug('invalid data sent') }

  if (!streams[data.id]) {
    streams[data.id] = []
    io.sockets.emit('streams', Object.keys(streams))
  }

  let message = {
    timestamp: data.timestamp,
    streamid: data.id,
    host: remote.address,
    port: remote.port,
    content: data.content,
    type: typeof data.content
  }

  streams[data.id].length >= argv.bufferSize && streams[data.id].shift()
  streams[data.id].push(message)

  debug(JSON.stringify(message))
  io.sockets.to(data.id).emit('line', message)
})

/*!
 * socket.io
 */
io.on('connection', function (socket) {
  socket.emit('streams', Object.keys(streams))
  socket.on('select stream', function (stream) {
    Object.keys(socket.rooms).forEach(function (key) {
      socket.leave(socket.rooms[key])
    })
    if (!stream) return
    socket.join(stream)
    socket.emit('backlog', streams[stream])
  })
})

fastify.register(require('fastify-static'), {
  root: path.join(__dirname, '../app')
})

/*!
 * listen!
 */
socket.bind(argv.udpPort, argv.udpHost)
fastify.listen(argv.webPort, argv.webHost)

debug('UDP  server listening: %s:%s', argv.udpHost, argv.udpPort)
debug('HTTP server listening: http://%s:%s', argv.webHost, argv.webPort)
