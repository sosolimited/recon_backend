//for testing
var common = require('./common.js');
var cc = require('./ccHandler.js');
var stats = require('./statsHandler.js');


var tcpServer;
var doc;
var ind, nextInd;
var intervalID;



function start() {

	// on a 'connection' event
  common.engine.on("connection", function(socket) {
	
    //curSocket = socket;
    console.log("Connection " + socket.id + " accepted.");
    
    socket.on("message", function(msg) {
      msg = JSON.parse(msg);
      console.log(msg);

      switch (msg.event) {
        case "loadDoc":
        	loadDoc(msg.data["docName"], msg.data["delay"]);
        	break;
        case "loadHistory":
        	loadHistory();
        	break;
      }
    });
        
    socket.on("close", function(){
      //curSocket = null;
      console.log("Connection " + socket.id + " terminated.");
    });	    

  });
	
  // create tcp server for handling cc chars stream
  tcpServer = common.net.createServer();
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
			
			console.log("data: "+data);
			
			//process.stdout.write(cc.stripTCPDelimiter(data));
			
			//jroth
			var newChars = cc.stripTCPDelimiter(data);
			cc.handleChars(newChars);
			
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
	common.mongo.open(function(err, p_client) {
	
		////  PEND TEMP FOR TESTING!!! initialize for testing
	
		// clear out dbs
		common.mongo.collection("word_instances", function(err, collection) {
			collection.remove(function(err, result) {});
		});
		common.mongo.collection("sentence_instances", function(err, collection) {
			collection.remove(function(err, result) {});
		});
		common.mongo.collection("unique_words", function(err, collection) {
			collection.remove(function(err, result) {});
		});
		
		common.mongo.collection("unique_2grams", function(err, collection) {
			collection.remove(function(err, result) {});
		});
		common.mongo.collection("unique_3grams", function(err, collection) {
			collection.remove(function(err, result) {});
		});
		common.mongo.collection("unique_4grams", function(err, collection) {
			collection.remove(function(err, result) {});
		});
		
		setInterval(stats.sendStats, 5000);
		
	});
	

    
}

// do it
start();


function loadDoc(docName, delay) {

	console.log("d "+delay+" n "+docName);
	
	// reset start date
	common.startTime = new Date().getTime();
		
	try {
		doc = common.fs.readFileSync(__dirname + '/documents/' + docName, 'utf8');
		
		if (delay == 0) {
			cc.handleChars(doc);
			cc.sendEndMessage();
		} else {
			ind = 0;
			nextInd = 0;
			clearTimeout(intervalID);
			intervalID = setInterval(sendCharsFromDoc, delay);
		}
	} catch (e) {
		console.log(e);
	}		
}

function loadHistory() {
		common.mongo.collection('messages', function(err, collection) {
		collection.find(function(err, cursor) {
			cursor.each(function(err, msg) { 
				console.log("SEND "+msg);
				// PEND only send to client requesting!
				common.sendMessage(msg, false);
			});
		});
	});	
}

function sendCharsFromDoc() {

	if (ind < doc.length) {
		nextInd = Math.min(ind + Math.floor((Math.random()*3)+1), doc.length);
		cc.handleChars(doc.substring(ind, nextInd));
		ind = nextInd;
	}
	else {
		clearTimeout(intervalID);
		cc.sendEndMessage();
	}
	
}


function receiveChars(response, request)
{
	var url_parts = url.parse(request.url, true);
	var newChars = url_parts.query.chars;
	
	cc.handleChars(newChars);
}
