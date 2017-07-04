/**
 * Created by Absoluteplay on 12/5/2559.
 */
var express = require('express');

module.exports = function (server, localhost) {
    'use strict';
    var router = express.Router();
    //var server = require('http').Server(app);
    var socketio = require('socket.io');
    var ioRedis = require('ioredis');
    var clientRedis = new ioRedis({port: 6379, host: localhost, db: 3});
    var request = require('request');
    var io = socketio(server);
    var BASE_URL = 'http://192.168.120.204:3344';
    if (process.env.NODE_ENV !== 'dev') {
        BASE_URL = 'https://sandbox-s9.hyp.live';
    }
    var kue = require('kue');
    var jobs = kue.createQueue({
        prefix: 'q',
        redis: {
            port: 6379,
            host: localhost,
            //auth: 'password',
            db: 4, // if provided select a non-default redis db
            options: {
                // see https://github.com/mranney/node_redis#rediscreateclient
            }
        }
    });


    var postUser = function (callback) {
        request.post({url: BASE_URL + '/user/login', form: {username: 'socket@ving.co.th', password: 'Ltl5MvYYpMmzdOvbtSO5xA==',deviceToken:'socket',platform:'web',keyPush:'socket'}},
            function (error, response, body) {
                if (response && response.statusCode == 200) {


                    var member = JSON.parse(body);
                    console.log(member);

                    return callback(null, member);
                }else{
                  console.log('error: ' + response + 'cannot login admin user');
                  console.log(error);
                  clientRedis.sadd('log:postUser', 'cannot login admin user');

                  return callback(response, body);
                }
            });
    };
    var userAdminToken = '';


    var getMember = function (memberId, accessToken, callback) {
        // Get member Detail
        request.get({url:BASE_URL + '/user/' + memberId,
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }},
            function (error, response, body) {
              try {
                if (response && response.statusCode == 200) {
                    var member = JSON.parse(body);

                    member.profile_pic = BASE_URL+member.avatar;
                    console.log(member);

                    return callback(null, member);
                } else {

                    console.log('error: ' + response + 'cannot get member');

                    return callback(response, body);
                }
              } catch (e) {
                return callback(response, body);
              }
            });
    };

    var numClients = {};
    var member = {};
    io.on('connection', function (socket) {

        delete io.sockets.connected[socket.id];

        socket.on('join', function (data, cb) {

            socket.video = data.video;
            socket.memberId = data.memberId;
            socket.accessToken = data.accessToken;

            socket.join(socket.video);

            console.log('join::::::',data);
            getMember(socket.memberId, socket.accessToken, function (err, result) {

                if (err) {
                    console.log(err.body);
                    io.sockets.connected[socket.id] = socket;
                    //cb(JSON.parse(err.body));
                    cb('unauthorized');
                    socket.disconnect('unauthorized');
                    return false;
                }
                try {
                    if (JSON.parse(result).error) {
                        cb(err.body);
                        socket.disconnect('unauthorized');
                        return false;
                    }
                } catch (e) {

                }

                member = result;
                socket.member = member;

                io.sockets.connected[socket.id] = socket;

                clientRedis.get('socket:' + socket.memberId, function (err, socket_key) {

                    if (socket_key) {
                        if (socket.id === socket_key) {

                        }
                    } else {

                        clientRedis.set('socket:' + data.memberId, socket.id);

                    }

                });


                clientRedis.sadd('video:viewer:' + socket.video, JSON.stringify(socket.member), function (err, result) {
                    if (err) {
                        console.log(err);
                        return false;
                    }
                    clientRedis.smembers('video:viewer:' + socket.video, function (err, result) {

                        clientRedis.llen('video:message:' + socket.video, function (err, length) {
                            clientRedis.lrange('video:message:' + socket.video, length - 20, length, function (err, message) {
                                if (err) {
                                    console.log(err);
                                    return false;
                                }

                                var member = [];
                                var temp_data = {};
                                result.forEach(function (value) {
                                    temp_data = JSON.parse(value);
                                    member.push({
                                        user_id: temp_data.id,
                                        displayName: temp_data.displayName,
                                        profile_pic: temp_data.profile_pic,
                                        socket_id: socket.id
                                    });

                                });

                                var history = [];
                                message.forEach(function (value) {
                                    temp_data = JSON.parse(value);

                                    history.push({
                                        user_id: temp_data.user.id,
                                        displayName: temp_data.user.displayName,
                                        profile_pic: temp_data.user.profile_pic,
                                        message: temp_data.message,
                                        created_at: temp_data.created_at
                                    });

                                });
                                var new_member = {
                                    user_id: socket.memberId,
                                    displayName: socket.member.displayName,
                                    profile_pic: socket.member.profile_pic,
                                    socket_id: socket.id
                                };


                                io.to(socket.video).emit('joined', new_member);
                                io.to(socket.video).emit('joined_' + socket.memberId, {
                                    member: member,
                                    history: history
                                });
                                var all_program = [];

                                clientRedis.smembers('video:update', function (err, update_program) {

                                    update_program.forEach(function (value) {
                                        temp_data = JSON.parse(value);
                                        all_program.push({
                                            name: temp_data.name,
                                            start: temp_data.start,
                                            end: temp_data.end,
                                            day: temp_data.day,
                                            description: temp_data.description,
                                            showtime: temp_data.showtime,
                                            id: temp_data.id,
                                            landscape: temp_data.landscape,
                                            portrait: temp_data.portrait,
                                            videoId: temp_data.videoId,
                                            videoName: temp_data.videoName,
                                            videoNameEng: temp_data.videoNameEng,
                                            videoNameTh: temp_data.videoNameTh
                                        });

                                    });
                                    cb(all_program);

                                });


                            });

                        });


                    });
                });


                clientRedis.get('video:view:' + socket.video + ':' + socket.memberId, function (err, exits) {

                    if (!exits) {
                        clientRedis.setex('video:view:' + socket.video + ':' + socket.memberId, 3600, JSON.stringify(socket.member));
                        clientRedis.incr('video:' + socket.video + ':views');
                    }
                    clientRedis.get('video:' + socket.video + ':views', function (err, views) {
                        io.to(socket.video).emit('views', {views: views});
                    });

                });


            });


        });


        socket.on('history', function (data) {
            clientRedis.llen('video:message:' + data.video, function (err, length) {
                clientRedis.lrange('video:message:' + data.video, length - 20, length, function (err, message) {
                    //console.log(message);

                });

            });

        });

        socket.on('leave', function () {


            socket.disconnect(socket.video);

        });

        socket.on('disconnect', function () {
            if (socket.member) {

                var leaved_member = {
                    id: socket.memberId,
                    displayName: socket.member.displayName,
                    profile_pic: socket.member.profile_pic
                };

                io.to(socket.video).emit('leaved', leaved_member);

                clientRedis.srem('video:viewer:' + socket.video, JSON.stringify(socket.member), function (err, result) {

                });

                clientRedis.del('socket:' + socket.memberId);
            }


        });


        socket.on('send.message', function (data) {
          console.log('send.message::::::',data);
          try {
            var new_member = {
                id: socket.memberId,
                displayName: socket.member.displayName,
                profile_pic: socket.member.profile_pic
            };

            create(data.message, socket.video, new_member);
          } catch (e) {
            console.log("Error socket send.message ::: " ,e);
          }

        });

    });

    function taskUserAdmin() {

        jobs.create('user', {}).delay(1000).priority('high')
            .removeOnComplete(true)
            .save();

    }

    taskUserAdmin();

    jobs.process('user', 1, function (job, done) {
        postUser(function (response, result) {

            if (response !== null) {
                if (response.statusCode !== 200) {
                    console.log('relogin');
                    taskUserAdmin();
                }

            } else {
                userAdminToken = result.token;
                jobs.create('video', {
                    accessToken: userAdminToken
                }).delay(1000).priority('high')
                    .removeOnComplete(true)
                    .save();
            }


        });

        done();
    });

    function create(message, video, member) {
        console.log("create::::::::::::::::::",message, video, member);
        var job = jobs.create('message', {
            title: message,
            message: message,
            video: video,
            member: member
        }).priority('high')
            .removeOnComplete(true).save();
        job.on('complete', function () {
            var d = new Date();
            var created_at = Math.floor(d.getTime() / 1000);
            clientRedis.rpush('video:message:' + video, JSON.stringify({
                user: member,
                message: message,
                created_at: created_at
            }), function (err, result) {
                if (err) {
                    console.log(err);
                    return err;
                }
                console.log('create :: clientRedis ::::::::::::::',result);
            });

        });

    }


    jobs.process('message', 1, function (job, done) {
        var message = job.data.message;
        var video = job.data.video;
        var member = job.data.member;
        var d = new Date();
        var created_at = Math.floor(d.getTime() / 1000);
        io.to(video).emit('receive.message', {
            user_id: member.id,
            displayName: member.displayName,
            profile_pic: member.profile_pic,
            message: message,
            created_at: created_at
        });

        jobs.on('failed', function(errorMessage){
          console.log('Job failed',errorMessage);
        });

        setTimeout(function () {
            done();
        }, 800);
    });

    jobs.process('like', 1, function (job, done) {

        postLikeProgram(job.data.programId, job.data.memberId, job.data.accessToken, function (err, result) {

            if (err) {
                return false;
            }
            var like_data = {};
            try {
                like_data = JSON.parse(result);

            } catch (e) {
                console.log(e); //error in the above string(in this case,yes)!

            }

            if (like_data.error) {
                console.log(job.data.memberId);
                console.log(like_data.error);
            } else {

                clientRedis.incr('video:' + job.data.videoId + ':' + job.data.programId + ':like', function (err, total) {
                    //console.log(total);
                    io.to(job.data.videoId).emit('update.like', {like: total, memberId: job.data.memberId});
                });
            }


        });
        done();
    });


    jobs.process('unlike', 1, function (job, done) {

        postUnLikeProgram(job.data.programId, job.data.memberId, job.data.accessToken, function (err, result) {

            if (err) {
                return false;
            }
            if (result.status == 'success') {

                clientRedis.decr('video:' + job.data.videoId + ':' + job.data.programId + ':like', function (err, total) {
                    io.to(job.data.videoId).emit('update.like', {like: total, memberId: job.data.memberId});
                });

            }


        });
        done();
    });


    jobs.process('follow', 1, function (job, done) {

        postFollowProgram(job.data.programId, job.data.memberId, job.data.accessToken, function (err, result) {

            if (err) {
                return false;
            }
            var follow_data = {};
            try {
                follow_data = JSON.parse(result);

            } catch (e) {
                console.log(e); //error in the above string(in this case,yes)!

            }

            if (follow_data.error) {
                console.log(job.data.memberId);
                console.log(follow_data.error);
            } else {

                clientRedis.incr('video:' + job.data.videoId + ':' + job.data.programId + ':follow', function (err, total) {
                    //console.log(total);
                    io.to(job.data.videoId).emit('update.follow', {follow: total, memberId: job.data.memberId});
                });
            }


        });
        done();
    });

    jobs.process('unfollow', 1, function (job, done) {

        postUnFollowProgram(job.data.programId, job.data.memberId, job.data.accessToken, function (err, result) {

            if (err) {
                return false;
            }
            var follow_data = {};
            try {
                follow_data = JSON.parse(result);

            } catch (e) {
                console.log(e); //error in the above string(in this case,yes)!

            }

            if (follow_data.error) {
                console.log(job.data.memberId);
                console.log(follow_data.error);
            } else {

                clientRedis.decr('video:' + job.data.videoId + ':' + job.data.programId + ':follow', function (err, total) {
                    //console.log(total);
                    io.to(job.data.videoId).emit('update.follow', {follow: total, memberId: job.data.memberId});
                });
            }


        });
        done();
    });


    //kue.app.listen(6666);

    router.get('/population', function (req, res) {
        var population = 0;

        if (numClients[req.query.video] !== undefined) {
            population = numClients[req.query.video];

        }
        io.to(req.query.video).emit('population', population);
        res.json({success: true, msg: 'video ' + req.query.video, total: population});
    });

    return router;

};
