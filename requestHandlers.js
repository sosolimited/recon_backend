var url = require("url");

var Db = require('mongodb').Db,
	Connection = require('mongodb').Connection,
    Server = require('mongodb').Server;
var client = new Db('test', new Server("205.186.145.170", 27017, {strict:true}));	

var ccHandler = require('./ccHandler.js');

client.open(function(err, p_client) {});


function receiveCC(response, request, socket) {

	var url_parts = url.parse(request.url, true);
	var newWord = url_parts.query.word;
	var newSentence = url_parts.query.sentence;
	var newPhrase = url_parts.query.phrase;
	var speaker = url_parts.query.speaker;

	// deal with new word
	if (newWord != null) {
	
	
		client.collection('unique_words', function(err, collection) { //open connection to unique_words table
			if (!err && collection) {
				
				client.collection('LIWC', function(e, c) {
					// first check if it's in LIWC (non wildcard)
					c.findOne({'word':newWord.toLowerCase()}, function(err, doc) {
						if (doc) {
							console.log("NORMAL "+newWord);
						
							broadcastWord(speaker, newWord, doc, socket);
						} else { // if not found, check wildcards
							client.collection('LIWC_wildcards', function(e, c) {
								c.findOne({$where: "'"+newWord.toLowerCase()+"'.indexOf(this.word) != -1" }, function(err, wdoc) {
									if (wdoc) {
										console.log("WILDCARD " + newWord);
										broadcastWord(speaker, newWord, wdoc, socket);
									}
								});
							});
						}
					});
				
				});
			}
		});
	}	
	
	if (newSentence != null) {
		broadcastSentence(speaker, newSentence, socket)
	}
	
	if (newPhrase != null) {
		broadcastPhrase(speaker, newPhrase, socket);
	}
	

}

function receiveChars(response, request, socket)
{
	var url_parts = url.parse(request.url, true);
	var newChars = url_parts.query.chars;
	
	ccHandler.handleChars(newChars);
}

function broadcastWord(sp, w, d, s) {
	if (s) {	
	
		// set emotion value
		var e = '';
		if (d.cat.indexOf('posemo') > -1)
			e = 'pos';
		else if (d.cat.indexOf('negemo') > -1)
			e = 'neg';	
			
		// create message to send					
		var message = {
		  speaker: sp,
		  word: w.toUpperCase(),
		  emo: e,
		  cat: d.cat
		};
		
		// send message
 		s.broadcast.emit('message',message);
		s.emit('message', message); //send message to sender	
	} 
	//else console.log("curSocket = null");

}

function broadcastSentence(sp, sent, s) {
	if (s) {		
		// create message to send					
		var message = {
		  speaker: sp,
		  sentence: sent
		};
		
		// send message
 		s.broadcast.emit('message',message);
		s.emit('message', message); //send message to sender
	}	
}

function broadcastPhrase(sp, phrase, s) {
	if (s) {
		// create message to send					
		var message = {
		  speaker: sp,
		  phrase: phrase
		};
		
		// send message
 		s.broadcast.emit('message',message);
		s.emit('message', message); //send message to sender	
	}
}

exports.receiveCC = receiveCC;
exports.receiveChars = receiveChars;

exports.ccHandler = ccHandler;
