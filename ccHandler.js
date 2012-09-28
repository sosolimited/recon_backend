
var common = require('./common.js');
// Include the stanford named-entity recognition
var namedentity = require(__dirname + "/named-entity");
// Include sentistrength
var sentistrength = require(__dirname + "/sentistrength");

//These variables need to remain global so that we can add to the buffers periodically
var curWordBuffer = "";
var curSentenceBuffer = "";
var curEventID = 0;
var curSpeaker = 0;
var sentenceStartF = true;
var cur2Gram = [];
var cur3Gram = [];
var cur4Gram = [];
var minNGramOccurrences = 4;

//MongoDB stuff
var curSentenceID = 0;

//Regular Expressions
//var wordRegExp = new RegExp(/[\s \! \? \; \( \) \[ \] \{ \} \< \> "]|,(?=\W)|[\.\-\&](?=\W)|:(?!\d)/g);
//var sentenceRegExp = new RegExp(/[\.|\?|\!]\s/g);
//var sentenceRegExp = new RegExp(/[\.|\?|\!]/);
//var abrevRegExp = new RegExp(/(Mr|Mrs|Ms|Dr|Sr|U\.S|D\.C)$/i);

var spaceRegEx = new RegExp(/\S{1,}/g);
var leadPunctRegEx = new RegExp(/^[\"|\'|>|-|+|\[|\{|$]{1,}/);
var numberRegEx = new RegExp(/\d{1,}.{1,}\d{1,}/);
var abbrevRegEx = new RegExp(/\w{1,}.{1,}\w{1,}/);
var wordRegEx = new RegExp(/\w{1,}/);
var sentenceEndRegEx = new RegExp(/[\.|\?|\!]/);

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
	curWordBuffer = parseWords(curWordBuffer);
	
}

//Function takes a buffer and pulls out any words
function parseWords(text)
{

	//return elements
	var returnBuf = "";

	//split input string with RegExo
	var tokens = text.match(spaceRegEx);
	var substrL = 0;

	for (i in tokens)
	{
		//If the element isn't the last in an array, it is a new word
		if ((i<tokens.length - 1) && tokens[i] !== "")
		{
			var tok = tokens[i];
			console.log("tok "+tok);
			
			substrL += tokens[i].length+1;
			
			// strip any leading punctuation
			var leadPunct = tok.match(leadPunctRegEx);
			if (leadPunct) {
				tok = tok.substring(leadPunct.length);
				console.log('lead p');
			}
			
			// pull any numbers
			
			var word;
			var sentenceEnd = false;
			
			var numWord = tok.match(numberRegEx);
			if (numWord) {
				console.log('number');
				word = numWord;
			}
		
			// pull any abbreviations
			// PEND: broken 
			var abbrevWord = tok.match(abbrevRegEx);
			if (abbrevWord && !word) {
				console.log('abbrev');
				word = abbrevWord;
			}
			
			// pull out word
			var plainWord = tok.match(wordRegEx);
			if (plainWord && !word) {
				word = plainWord;
			}
			
			var endPunct = tok.replace(word, "");
			
			// check if sentence end
			if (endPunct.search(sentenceEndRegEx) != -1) {
				sentenceEnd = true;
			}
		
			var speakerSwitch = false;
		
			console.log("Word: " + word);
			if (word == "MODERATOR" || word == "QUESTION" || word == "BROKAW" || word == "IFILL") {
				curSpeaker = 0;
				speakerSwitch = true;
			}
			else if (word == "OBAMA" || word == "BIDEN") {
				curSpeaker = 1;
				speakerSwitch = true;
			}
			else if (word == "MCCAIN" || word == "ROMNEY" || word == "PALIN") {
				curSpeaker = 2;
				speakerSwitch = true;
			}

			namedentity(word, sentenceStartF, function(resp) {
				handleWord(curSpeaker, leadPunct, resp, endPunct, sentenceEnd, speakerSwitch); 
			});
		}
		//Otherwise this should be returned as part of the buffer
		else {
			returnBuf = text.substring(substrL);
		}
	}

	//return both the current buffer and the found words
	return returnBuf;

}

function handleWord(speaker, leadPunct, w, endPunct, sentenceEnd, speakerSwitch)
{	

	console.log("HANDLE WORD "+leadPunct+" "+w+" "+endPunct+" speaker "+speaker);
	var curWordID = new common.mongo.bson_serializer.ObjectID(); 
	var timeDiff = new Date().getTime() - common.startTime;
	
	// if new sentence, generate ID and insert into sentence_instances


	var funcs = [
	    function(cb) { // log sentence
	    	logSentence(speaker, curWordID, timeDiff, cb);
	    },
	    function(cb) { // look up categories
		  	getCats(w, cb);
	    },
	    function(cats, cb) { // log unique word
		    //console.log("cats "+cats);
		    logUniqueWord(curWordID, w, cats, cb);
	    },
	    function(uniqueWDoc, cb) { // log word instance
		    //console.log("uniqueWDoc "+uniqueWDoc);
	   		logWordInstance(speaker, curWordID, uniqueWDoc, timeDiff, cb);
	   	},
	    function(uniqueWDoc, cb) { // process 4 grams
				processNGrams(4, timeDiff, speaker, curWordID, curSentenceID, uniqueWDoc, [], cb);
			},
	    function(uniqueWDoc, ngrams, cb) { // process 3 grams
				processNGrams(3, timeDiff, speaker, curWordID, curSentenceID, uniqueWDoc, ngrams, cb);
			},
	    function(uniqueWDoc, ngrams, cb) { // process 2 grams
				processNGrams(2, timeDiff, speaker, curWordID, curSentenceID, uniqueWDoc, ngrams, cb);
			},
			function(uniqueWDoc, ngrams, cb) { // send punctuation
				if (leadPunct) {
					if (leadPunct != ' ' && leadPunct != '\n' && leadPunct.length == 1) 
						sendWord(cb, timeDiff - 1, speaker, -1, leadPunct, true);
					else cb(null, uniqueWDoc, ngrams);	
				} else cb(null, uniqueWDoc, ngrams);
			},
			function(uniqueWDoc, ngrams, cb) { // send word
				if (!speakerSwitch)
					sendWord(cb, timeDiff, speaker, uniqueWDoc, uniqueWDoc.word, false, ngrams);	
			},
			function(uniqueWDoc, ngrams, cb) { // send punctuation
				if (endPunct) {
					if (endPunct != ' ' && endPunct != '\n' && endPunct.length == 1) 
						sendWord(cb, timeDiff + 1, speaker, -1, endPunct, true);
					else cb(null, uniqueWDoc, ngrams);	
				} 
				else cb(null, uniqueWDoc, ngrams);
			},
			function(uniqueWDoc, ngrams, cb) {
				if (sentenceEnd) 
					handleSentenceEnd(timeDiff, speaker, cb)
				else {
					cb(null);
				}
			}
	];

	var cb = function(err, res) {
	    console.log(arguments);
	};

	common.async.waterfall(funcs, cb);


}


function getCats(w, cb) {

	var cats = [];
	
	if (w.search(/\d/) != -1) {
		cats.push('number');
	}

	common.mongo.collection('LIWC', function(e, c) {
		// first check if it's in LIWC (non wildcard)
		c.findOne({'word':w.toLowerCase()}, function(err, doc) {
		
			// add categories
			if (doc) {
				//console.log("NORMAL "+w);
				cb(null, cats.concat(doc.cat));
			} 
			else { // if not found, check wildcards
				common.mongo.collection('LIWC_wildcards', function(e, c) {
					c.findOne({$where: "'"+w.toLowerCase()+"'.indexOf(this.word) != -1" }, function(err, wdoc) {
						if (wdoc) {
							//console.log("WILDCARD " + w);
							cb(null, cats.concat(wdoc.cat));
						} else cb(null, cats);
					});
				});
			}
		});
	});
}

function logUniqueWord(wordID, w, cats, cb) {
	
	//console.log('logUniqueWord');
	common.mongo.collection('unique_words'+common.db_suffix, function(err, collection) { 
		// upsert unique_words
		collection.findAndModify(
			{word: w}, 
			[['_id','asc']], 
			{$push: {wordInstanceIDs: wordID, sentenceInstanceIDs: curSentenceID}, $set: {categories: cats}},
			{upsert:true, new:true},
			function(err, object) {
				//console.log("object "+object);
				cb(null, object);
		});
	});
}

function logWordInstance(speaker, wordID, uniqueWDoc, time, cb) {
	//console.log('logWordInstance');
	// insert into word_instances with cats
	common.mongo.collection('word_instances'+common.db_suffix, function(err, collection) {
		// insert into word_instances
		var doc = {
			_id: wordID,
			word: uniqueWDoc.word,
			sentenceID: curSentenceID,
			speakerID: speaker,
			eventID: curEventID,
			categories: uniqueWDoc.categories,
			timeDiff: time
		}
		collection.insert(doc);
		cb(null, uniqueWDoc);
	});
}

function logSentence(speaker, wordID, time, cb) {
	
	//console.log('logSentence');	
	common.mongo.collection('sentence_instances'+common.db_suffix, function(err, collection) {
		if (sentenceStartF) {
			curSentenceID = new common.mongo.bson_serializer.ObjectID();
			
			var doc = {
				_id: curSentenceID,
				wordInstanceIDs: [wordID],
				speakerID: speaker,
				eventID: curEventID,
				timeDiff: time
			}
			
			collection.insert(doc);
		} 
		// else add curWordID to wordInstanceIDs
		else {
			collection.update({_id: curSentenceID}, {$push: {wordInstanceIDs: wordID}});
		}
		
		cb(null);
	});
}

function processNGrams(l, t, speaker, wID, sID, uniqueWDoc, ngrams, cb) {

	//console.log('processNGrams');
	
	var curGram;
	if (l == 2) curGram = cur2Gram;
	else if (l == 3) curGram = cur3Gram;
	else if (l == 4) curGram = cur4Gram;

	// check for 2grams
	if (curGram.length == l) {
		curGram.shift();
		curGram.push(uniqueWDoc.word);
		common.mongo.collection('unique_'+l+'grams'+common.db_suffix, function(e, c) {
			c.findAndModify(
				{ngram: curGram},
				[['_id','asc']], 
				{$push: {wordInstanceIDs: wID, sentenceInstanceIDs: sID}}, 
				{upsert:true, new:true},
				function(err, object) {
					if(object.wordInstanceIDs.length == minNGramOccurrences) {
						sendNewNGram(t, object._id, curGram, object.wordInstanceIDs);
					}
					if(object.wordInstanceIDs.length >= minNGramOccurrences) {
						ngrams.push([object._id, object.wordInstanceIDs.length]);
					}
					cb(null, uniqueWDoc, ngrams);
				}
			);
		});
	} else {
		curGram.push(uniqueWDoc.word);
		cb(null, uniqueWDoc, ngrams);
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
  common.sendMessage(message, true);
}

function sendWord(cb, t, s, uniqueWDoc, w, punctuationF, ngramsArr)
{
	var message = {
		type: "word",
		timeDiff: t,
		dbid: uniqueWDoc._id,
		word: w,
		speaker: s,
		punctuationFlag: punctuationF
	};
	
	if (!punctuationF) {
		message['sentenceStartFlag'] = sentenceStartF;
		message['cats'] = uniqueWDoc.categories;
		message['wordInstances'] = uniqueWDoc.wordInstanceIDs.length;
		message['ngrams'] = ngramsArr;
		sentenceStartF = false; //reset
	}

  common.sendMessage(message, true);
  cb(null, uniqueWDoc, ngramsArr);
}


function handleSentenceEnd(timeDiff, speaker, cb) {
		// analyze sentiment
  sentistrength(curSentenceBuffer, function(sentiment) {
		sendSentenceEnd(timeDiff, speaker, sentiment, curSentenceBuffer.split(" ").length-1);
			
		sentenceStartF = true;
		curSentenceBuffer = "";
		
		// reset ngrams at start of sentence
		cur2Gram = [];
		cur3Gram = [];
		cur4Gram = [];
		
		cb(null);
	});
}


function sendSentenceEnd(t, speaker, senti, l)
{
	var message = {
		type: "sentenceEnd",
		timeDiff: t,
		speaker: speaker,
		sentiment: senti,
		length: l
	};
	console.log("SENTENCE END!! "+message);
	common.sendMessage(message, true);
}

function sendEndMessage() {
	var message = {
		type: "transcriptDone",
		timeDiff: (new Date().getTime()) - common.startTime
	};
	common.sendMessage(message, true);
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
	
	//JRO 092712 - using new line delimiter
	//also not just looking at the end of the string since messages get concatenated

/*
	text = text.replace("***\0", '');
	//PEND: fix this
	//for some reason, it's missing the replace every once in a while, but doing it twice helps 
	text = text.replace("***\0", '');
*/

	//JRO 092712 - using new line delimiter
	text = text.replace("\n", '');
	//PEND: fix this
	//for some reason, it's missing the replace every once in a while, but doing it twice helps 
	text = text.replace("\n", '');

	return text;
}

//JRO - explict call to change speaker
function setSpeaker(id)
{
	//NOTE: not testing the id
	curSpeakerID = id;
}



//exposing this to for debugging and testing
//TODO: make private once tested
exports.parseWords = parseWords;
exports.stripTCPDelimiter = stripTCPDelimiter;
exports.handleChars = handleChars;
exports.sendEndMessage = sendEndMessage;
exports.setSpeaker = setSpeaker;
