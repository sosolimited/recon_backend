var http = require("http");
var url = require("url");
var net = require('net');
var fs = require("fs");

var Db = require('mongodb').Db,
	Connection = require('mongodb').Connection,
    MongoServer = require('mongodb').Server;
var client = new Db('test', new MongoServer("205.186.145.170", 27017, {strict:true}));	

var tcpServer, httpServer;
var io;

var doc;
var ind, nextInd;
var intervalID;


//for testing
var cc = require('./ccHandler.js');



function start() {
	
	// create http server for handling loadDoc requests
	httpServer = http.createServer();
	httpServer.listen(8081);
	console.log('HTTP server listening on ' + httpServer.address().address + ':' + httpServer.address().port);
	
	// start socket
	io = require("socket.io").listen(httpServer);

	// on a 'connection' event
	io.sockets.on('connection', function(socket){
	
		//curSocket = socket;
		console.log("Connection " + socket.id + " accepted.");
		
				
		socket.on('loadDoc', function(data){
			console.log('loadDoc ' + data);
			loadDoc(data['docName'], data['delay'], io);
		});	
		
		socket.on('disconnect', function(){
			//curSocket = null;
			console.log("Connection " + socket.id + " terminated.");
		});	    
	});
	
	// create tcp server for handling cc chars stream
	tcpServer = net.createServer();
	//Pass in null for host to bind server to 0.0.0.0. Then it will accept connections directed to any IPv4 address.
	tcpServer.listen(8088, null, function (){
		console.log('TCP server listening on ' + tcpServer.address().address + ':' + tcpServer.address().port);
	});
	
	tcpServer.on('connection', function(sock) {
		//We have a connection - a socket object is assigned to the connection automatically
		console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
						
		//Add a 'data' event handler to this instance of socket
		sock.on('data', function(data){
			
			data = String(data);
			//process.stdout.write(cc.stripTCPDelimiter(data));
			
			//jroth
			var newChars = cc.stripTCPDelimiter(data);
			cc.handleChars(newChars, io);
			
			//data = String(data).substring(0, data.length - 4);
			//console.log('DATA' + sock.remoteAddress + ': ' + data);
			//process.stdout.write(data);
			
			//Write the data back to the socket, the client will receive it as data from the server
			//sock.write('You said "' + data + '"');
		});
		
		//Add a 'close' event handler to this instance of socket
		sock.on('close', function(data){
			console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
		});
	
	});
	
	// mongodb
	client.open(function(err, p_client) {});
	
}

// do it
start();


function loadDoc(docName, delay) {

	console.log("d "+delay+" n "+docName);
	
	try {
		doc = fs.readFileSync(__dirname + '/documents/' + docName, 'utf8');
		
		if (delay == 0)
			ccHandler.handleChars(doc, io);
		else {
			ind = 0;
			nextInd = 0;
			clearTimeout(intervalID);
			intervalID = setInterval(sendCharsFromDoc, delay);
		}
	} catch (e) {
		console.log(e);
	}		
}

function sendCharsFromDoc() {

	if (ind < doc.length) {
		nextInd = Math.min(ind + Math.floor((Math.random()*3)+1), doc.length);
		cc.handleChars(doc.substring(ind, nextInd), io);
		ind = nextInd;
	}
	else clearTimeout(intervalID);
	
}


function receiveChars(response, request)
{
	var url_parts = url.parse(request.url, true);
	var newChars = url_parts.query.chars;
	
	cc.handleChars(newChars, io);
}


// stuff for testing, not sure exactly what needs to be done with this still, john?
/*var str='Here\'s a (good, bad, indifferent, ...) '+
        'example sentence to be used in this test '+
        'of English language "token-extraction". ' +
        'How about $10,000 in \'additional\' cash?';
        
var testString = "Perhaps even more worryingly, German data released 3:15 Thursday showed signs of a \"slowdown\" in an economy that until now had been a bright spot for the Continent's backside. A 1,000 $12,314.32 Markit index based on surveys of purchasing managers of German manufacturing companies fell to 45.0 in May from 46.2 in April."
requestHandlers.ccHandler.parseWords(testString);*/