var Db = require('mongodb').Db;
var MongoServer = require('mongodb').Server;
var engine = require("engine.io");

module.exports = {
	url : require("url"),
	net : require('net'),
	fs : require("fs"),
	
	mongo : new Db('test', new MongoServer("205.186.145.170", 27017, {strict:true})),
  engine : engine.listen(8081)
};
