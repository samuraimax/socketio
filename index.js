/**
 * Created by Samuraimax on 8/6/2560.
 */
var http = require('http');
var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var path = require('path');
var morgan = require('morgan');
var debug = require('debug');
var cookieParser = require('cookie-parser');
//var redis = require('redis');
var ioRedis = require('ioredis');


var localhost = process.env.NODE_HOST;

if (!process.env.NODE_HOST) {
    localhost = '127.0.0.1';
}
var clientRedis = new ioRedis({port: 6379, host: localhost, db: 3});



var app = express();

var server = require('http').Server(app);


var socket = require('./socket')(server, localhost);


app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
//app.use(cookieParser);
app.use(morgan('dev'));

var port = process.env.PORT || 5555;

var router = express.Router();



app.use('/socket', socket);

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

app.get('/test', function (req, res) {
    res.sendFile(__dirname + '/index2.html');
});


server.listen(port);
console.log('Start on port ' + port);


clientRedis.on('error', function (err) {
    console.log('redis is not running');

});
