
var common = require('./common.js');
// Include the stanford named-entity recognition
var namedentity = require(__dirname + "/named-entity");
// Include sentistrength
var sentistrength = require(__dirname + "/sentistrength");

//These variables need to remain global so that we can add to the buffers periodically
var curWordBuffer = "";
var curSentenceBuffer = "";
var curSpeakerID = 0; //0 - moderator, 1 - obama, 2 - romney
var curEventID = 0;
var sentenceStartF = true;
var cur2Gram = [];
var cur3Gram = [];
var cur4Gram = [];
var minNGramOccurrences = 4;

//MongoDB stuff
var curSentenceID = 0;

//Regular Expressions
var wordRegExp = new RegExp(/[\s \! \? \; \( \) \[ \] \{ \} \< \> "]|,(?=\W)|[\.\-\&](?=\W)|:(?!\d)/g);
var sentenceRegExp = new RegExp(/[\.|\?|\!]\s/g);
var abrevRegExp = new RegExp(/(Mr|Mrs|Ms|Dr|Sr|U\.S|D\.C)$/i);

//Called from outside of 
function handleChars(newChars)
{
	//console.log(newChars);
	//process.stdout.write(newChars);

	//1. add chars to current word
	curWordBuffer += newChars;

	//2. add chars to current sentence
	curSentenceBuffer += newChars;
	
	//3. find the words in the buffer
	curWordBuffer = parseWords(curWordBuffer, function() {
		
		//4. find sentences
		curSentenceBuffer = parseSentence(curSentenceBuffer)[0];

	})[0];
	//console.log(curBuffer);
	
}

//Function takes a buffer and pulls out any words
function parseWords(text, func)
{
	//return elements
	var foundWords = [];
	var returnBuf = "";
	
	//PEND: maybe it just has the *** on occasion?
	text = text.replace("***", '');
	
	
	var ind = 0; 
	
	while (ind != -1) {
		
		ind = text.search(wordRegExp);

		if (ind == 0) {
			sendWord(new Date().getTime() - common.startTime, -1, text.substring(0,1), true);
		} else if (ind > 0) {
			var word = text.substring(0, ind);
			var punct = text.substring(ind, ind+1);
			
			foundWords.push(word);
			console.log("Word: " + word);
			if (word == "MODERATOR" || word == "QUESTION" || word == "BROKAW" || word == "IFILL") curSpeakerID = 0;
			else if (word == "OBAMA" || word == "BIDEN") curSpeakerID = 1;
			else if (word == "MCCAIN" || word == "ROMNEY" || word == "PALIN") curSpeakerID = 2;
			else { //only broadcast if not speaker name
				namedentity(word, sentenceStartF, function(resp) {
					handleWord(resp, false, 0, punct, func);
				});
			}
	
		}
		
		text = text.substring(ind+1);
	}
		
	return [text, foundWords];
	
	//split input string with RegExo
	var tokens = text.split(wordRegExp);
	
	for (i in tokens)
	{
		//If the element isn't the last in an array, it is a new word
		if ((i<tokens.length - 1) && tokens[i] !== "")
		{
			foundWords.push(tokens[i]);
			console.log("Word: " + tokens[i]);
			if (tokens[i] == "MODERATOR" || tokens[i] == "QUESTION" || tokens[i] == "BROKAW" || tokens[i] == "IFILL") curSpeakerID = 0;
			else if (tokens[i] == "OBAMA" || tokens[i] == "BIDEN") curSpeakerID = 1;
			else if (tokens[i] == "MCCAIN" || tokens[i] == "ROMNEY" || tokens[i] == "PALIN") curSpeakerID = 2;
			else { //only broadcast if not speaker name
				namedentity(tokens[i], sentenceStartF, function(resp) {
					handleWord(resp, false, 0, func); //PEND updates these args to be correct
				});
			}
		}
		//Otherwise this should be returned as part of the buffer
		else returnBuf = tokens[i];
	}
	
	//return both the current buffer and the found words
	return [returnBuf, foundWords];
}

function handleWord(w, ngram, ngramInst, punct, func)
{	
	var curWordID = new common.mongo.bson_serializer.ObjectID(); 
	var curTime = new Date().getTime();

	common.mongo.collection('sentence_instances', function(err, collection) {
		// if new sentence, generate ID and insert into sentence_instances
		if (curSentenceID === 0) {
			curSentenceID = new common.mongo.bson_serializer.ObjectID();
			
			var doc = {
				_id: curSentenceID,
				wordInstanceIDs: [curWordID],
				speakerID: curSpeakerID,
				eventID: curEventID,
				timeDiff: curTime - common.startTime
			}
			
			collection.insert(doc);
		} 
		// else add curWordID to wordInstanceIDs
		else {
			collection.update({_id: curSentenceID}, {$push: {wordInstanceIDs: curWordID}});
		}
	});
	
	
	common.mongo.collection('word_instances', function(err, collection) {
		// insert into word_instances
		var doc = {
			_id: curWordID,
			word: w,
			sentenceID: curSentenceID,
			speakerID: curSpeakerID,
			eventID: curEventID,
			timeDiff: curTime - common.startTime
		}
		collection.insert(doc);
		
		console.log("w:"+w);
		
		//updateFreq(collection, word);
	});
	
	
	common.mongo.collection('unique_words', function(err, collection) { 
		// upsert unique_words
		//collection.update({word: w}, {$push: {wordInstanceIDs: curWordID, sentenceInstanceIDs: curSentenceID}}, {upsert:true});
		collection.findAndModify(
			{word: w}, 
			[['_id','asc']], 
			{$push: {wordInstanceIDs: curWordID, sentenceInstanceIDs: curSentenceID}}, 
			{upsert:true, new:true},
			function(err, object) {
			
				common.mongo.collection('LIWC', function(e, c) {
					// first check if it's in LIWC (non wildcard)
					c.findOne({'word':w.toLowerCase()}, function(err, doc) {
					
						// add categories
						var cats = [];
						if (doc) {
							collection.update({word: w}, {$set: {categories: doc.cat}}, {upsert:true});	
							//console.log("NORMAL "+w);
							cats = doc.cat;		
						} 
						else { // if not found, check wildcards
							common.mongo.collection('LIWC_wildcards', function(e, c) {
								c.findOne({$where: "'"+w.toLowerCase()+"'.indexOf(this.word) != -1" }, function(err, wdoc) {
									if (wdoc) {
										//console.log("WILDCARD " + w);
										collection.update({word: w}, {$set: {categories: wdoc.cat}}, {upsert:true});	
										cats = wdoc.cat;
									}
								});
							});
						}
						
						
						// process ngrams and send
						processNGrams(curTime - common.startTime, w, curWordID, curSentenceID, function (ngrams) {
							sendWord(curTime - common.startTime, object._id, w, false, cats, object.wordInstanceIDs.length, ngrams);	
							sendWord(curTime - common.startTime + 1, -1, punct, true);	
							func();
						});
					});
				});
			});
	});
}

function processNGrams(t, w, wID, sID, func) {
	var ngrams = [];

	// check for 2grams
	if (cur2Gram.length == 2) {
		cur2Gram.shift();
		cur2Gram.push(w);
		common.mongo.collection('unique_2grams', function(e2, c2) {
			c2.findAndModify(
				{ngram: cur2Gram},
				[['_id','asc']], 
				{$push: {wordInstanceIDs: wID, sentenceInstanceIDs: sID}}, 
				{upsert:true, new:true},
				function(err2, object2) {
					if(object2.wordInstanceIDs.length == minNGramOccurrences) {
						sendNewNGram(t, object2._id, cur2Gram, object2.wordInstanceIDs);
					}
					if(object2.wordInstanceIDs.length >= minNGramOccurrences) {
						ngrams.push([object2._id, object2.wordInstanceIDs.length]);
					}
					
					// check for 3grams
					if (cur3Gram.length == 3) {
						cur3Gram.shift();
						cur3Gram.push(w);
						common.mongo.collection('unique_3grams', function(e3, c3) {
							c3.findAndModify(
								{ngram: cur3Gram},
								[['_id','asc']], 
								{$push: {wordInstanceIDs: wID, sentenceInstanceIDs: sID}}, 
								{upsert:true, new:true},
								function(err3, object3) {
									if(object3.wordInstanceIDs.length == minNGramOccurrences) {
										sendNewNGram(t, object3._id, cur3Gram, object3.wordInstanceIDs);
									}
									if(object3.wordInstanceIDs.length >= minNGramOccurrences) {
										ngrams.push([object3._id, object3.wordInstanceIDs.length]);
									}
									
									if (cur4Gram.length == 4) {
										cur4Gram.shift();
										cur4Gram.push(w);
										common.mongo.collection('unique_4grams', function(e4, c4) {
											c4.findAndModify(
												{ngram: cur4Gram},
												[['_id','asc']], 
												{$push: {wordInstanceIDs: wID, sentenceInstanceIDs: sID}}, 
												{upsert:true, new:true},
												function(err4, object4) {
													if(object4.wordInstanceIDs.length == minNGramOccurrences) {
														sendNewNGram(t, object4._id, cur4Gram, object4.wordInstanceIDs);
													}
													if(object4.wordInstanceIDs.length >= minNGramOccurrences) {
														ngrams.push([object4._id, object4.wordInstanceIDs.length]);
													}
												});
										});
									} else {
										cur4Gram.push(w);
									}							
									
									func(ngrams);
								});
						});
					} else {
						cur3Gram.push(w);
						func(ngrams);
					}									
				}
			);
		});
	} else {
		cur2Gram.push(w);
		func(ngrams);
	}

}

function sendNewNGram(t, nid, n, nInstances) {
	var message = {
		type: "newNGram",
		timeDiff: t,
		dbid: nid,
		ngram: n, 
		instances: nInstances
	};
  sendMessage(message);
}

function sendWord(t, wid, w, punctuationF, wcats, numInstances, ngramsArr)
{
	var message = {
		type: "word",
		timeDiff: t,
		dbid: wid,
		word: w,
		speaker: curSpeakerID,
		punctuationFlag: punctuationF
	};
	
	if (!punctuationF) {
		message['sentenceStartFlag'] = sentenceStartF;
		message['cats'] = wcats;
		message['wordInstances'] = numInstances;
		message['ngrams'] = ngramsArr;
		sentenceStartF = false; //reset
	}

  sendMessage(message);
}


//Function takes a buffer and pulls out any sentences

function parseSentence(text)
{
	var time = (new Date().getTime()) - common.startTime;

	//return elements
	var foundSentences = [];
	var returnBuf = "";
	
	//maybe it just has the *** on occasion?
	text = text.replace("***", '');
	
	//split input string with RegExo
	var tokens = text.split(sentenceRegExp);
	
	
	for (i=0; i<tokens.length; i++)
	{
		//if (tokens.length > 1) console.log("  Token:"+i+":"+tokens[i]+"<<");
	
		//If the element isn't the last in an array, it is a new word
		if ((i<tokens.length - 1) && tokens[i] !== "")
		{
			//if the sentence ends with an abbrev, it is a false positive
			//concat the current token and the next token
			if (checkAbrev(tokens[i])) 
			{
				var next = tokens[i]+". "+tokens[i+1];
				//console.log("  Next:"+next);
				
				tokens[i+1] = next;
			}
			else 
			{		
				//need to find the punctuation in the original word
				var index = text.lastIndexOf(tokens[i]) + tokens[i].length;
				var punct = text.slice(index, index+1)
				//console.log("Index: "+ index + " >> Punctuation: "+ punct);
			
				tokens[i] += punct;
			
				foundSentences.push(tokens[i]);
				console.log("Sentence: " + tokens[i]);
				
				var str = tokens[i];
				
				// analyze sentiment
	      sentistrength(tokens[i], function(sentiment) {
					sendSentenceEnd(time, sentiment, str.split(" ").length-1);
				});
				sentenceStartF = true;
				
				// reset ngrams at start of sentence
				cur2Gram = [];
				cur3Gram = [];
				cur4Gram = [];
			}		
			
		}	
		//Otherwise this should be returned as part of the buffer
		else returnBuf = tokens[i];
	}
	
	//return both the current buffer and the found words
	return [returnBuf, foundSentences];
}

function sendSentenceEnd(t, senti, l)
{
console.log("SENTENCE END!!");
	var message = {
		type: "sentenceEnd",
		timeDiff: t,
		speaker: curSpeakerID,
		sentiment: senti,
		length: l
	};
  console.log(message);
	sendMessage(message);
}

function sendEndMessage() {
	var message = {
		type: "transcriptDone",
		timeDiff: (new Date().getTime()) - common.startTime
	};
	sendMessage(message);
}

function sendMessage(msg) {
	// send msg
  Object.keys(common.engine.clients).forEach(function(key) {
    common.engine.clients[key].send(JSON.stringify(msg));
  });
  
  //console.log(msg);
  
  // log msg
  common.mongo.collection('messages', function(err, collection) {
		collection.insert(msg);
	});
	
}


//TODO: load a text file and generate a RegExp (or a series of them) based on the file
function checkAbrev(token1)
{
	//console.log(token1 + ">>" + abrevRegExp.test(token1));
	
	if (abrevRegExp.test(token1))
	{	
		//console.log("Match: " + token1);
		return true;
	}
	else return false;
}



//TODO: This is still failing to delinit
function stripTCPDelimiter(text)
{		
	//var re = '/\*{3}./';
	//text = text.replace(re, '');

	text = text.replace("***\0", '');
	//PEND: fix this
	//for some reason, it's missing the replace every once in a while, but doing it twice helps 
	text = text.replace("***\0", '');

	return text;
}



//exposing this to for debugging and testing
//TODO: make private once tested
exports.parseWords = parseWords;
exports.stripTCPDelimiter = stripTCPDelimiter;
exports.handleChars = handleChars;
exports.sendEndMessage = sendEndMessage;
