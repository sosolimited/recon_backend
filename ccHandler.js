
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
	curWordBuffer = parseWords(curWordBuffer)[0];
	
	//4. find sentences
	curSentenceBuffer = parseSentence(curSentenceBuffer)[0];
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
			sendWord(function(){}, new Date().getTime() - common.startTime, -1, text.substring(0,1), true);
		} else if (ind > 0) {
			var word = text.substring(0, ind);
			var punct = text.substring(ind, ind+1);
			
			foundWords.push(word);
			//console.log("Word: " + word);
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

}

function handleWord(w, ngram, ngramInst, punct, func)
{	

console.log("HANDLE WORD "+w);
	var curWordID = new common.mongo.bson_serializer.ObjectID(); 
	var timeDiff = new Date().getTime() - common.startTime;
	
	// if new sentence, generate ID and insert into sentence_instances


	var funcs = [
	    function(cb) { // log sentence
	    	logSentence(curWordID, timeDiff, cb);
	    },
	    function(cb) { // look up categories
		  	getCats(w, cb);
	    },
	    function(cats, cb) { // log unique word
		    console.log("cats "+cats);
		    logUniqueWord(curWordID, w, cats, cb);
	    },
	    function(uniqueWDoc, cb) { // log word instance
		    //console.log("uniqueWDoc "+uniqueWDoc);
	   		logWordInstance(curWordID, w, uniqueWDoc, timeDiff, cb);
	   	},
	    function(uniqueWDoc, cb) { // process 4 grams
				processNGrams(4, timeDiff, w, curWordID, curSentenceID, uniqueWDoc, [], cb);
			},
	    function(uniqueWDoc, ngrams, cb) { // process 3 grams
				processNGrams(3, timeDiff, w, curWordID, curSentenceID, uniqueWDoc, ngrams, cb);
			},
	    function(uniqueWDoc, ngrams, cb) { // process 2 grams
				processNGrams(2, timeDiff, w, curWordID, curSentenceID, uniqueWDoc, ngrams, cb);
			},
			function(uniqueWDoc, ngrams, cb) { // send word
				sendWord(cb, timeDiff, uniqueWDoc._id, w, false, uniqueWDoc.categories, uniqueWDoc.wordInstanceIDs.length, ngrams);	
			},
			function(cb) { // send punctuation
				if (punct != ' ' && punct != '\n' && punct.length == 1) sendWord(cb, timeDiff + 1, -1, punct, true);	
			}
	];

	var cb = function(err, res) {
	    console.log(arguments);
	};

	common.async.waterfall(funcs, cb);


}

function getCats(w, cb) {

	var cats = [];

	common.mongo.collection('LIWC', function(e, c) {
		// first check if it's in LIWC (non wildcard)
		c.findOne({'word':w.toLowerCase()}, function(err, doc) {
		
			// add categories
			if (doc) {
				//console.log("NORMAL "+w);
				cb(null, doc.cat);
			} 
			else { // if not found, check wildcards
				common.mongo.collection('LIWC_wildcards', function(e, c) {
					c.findOne({$where: "'"+w.toLowerCase()+"'.indexOf(this.word) != -1" }, function(err, wdoc) {
						if (wdoc) {
							//console.log("WILDCARD " + w);
							cb(null, wdoc.cat);
						}
					});
				});
			}
		});
	});
}

function logUniqueWord(wordID, w, cats, cb) {
	
	//console.log('logUniqueWord');
	common.mongo.collection('unique_words', function(err, collection) { 
		// upsert unique_words
		collection.findAndModify(
			{word: w}, 
			[['_id','asc']], 
			{$push: {wordInstanceIDs: wordID, sentenceInstanceIDs: curSentenceID}, $set: {categories: cats}},
			{upsert:true, new:true},
			function(err, object) {
				console.log("object "+object);
				cb(null, object);
		});
	});
}

function logWordInstance(wordID, w, uniqueWdoc, time, cb) {
	//console.log('logWordInstance');
	// insert into word_instances with cats
	common.mongo.collection('word_instances', function(err, collection) {
		// insert into word_instances
		var doc = {
			_id: wordID,
			word: w,
			sentenceID: curSentenceID,
			speakerID: curSpeakerID,
			eventID: curEventID,
			categories: uniqueWdoc.categories,
			timeDiff: time
		}
		collection.insert(doc);
		cb(null, uniqueWdoc);
	});
}

function logSentence(wordID, time, cb) {
	
	//console.log('logSentence');	
	common.mongo.collection('sentence_instances', function(err, collection) {
		if (sentenceStartF) {
			curSentenceID = new common.mongo.bson_serializer.ObjectID();
			
			var doc = {
				_id: curSentenceID,
				wordInstanceIDs: [wordID],
				speakerID: curSpeakerID,
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

function processNGrams(l, t, w, wID, sID, uniqueWDoc, ngrams, cb) {

	//console.log('processNGrams');
	
	var curGram;
	if (l == 2) curGram = cur2Gram;
	else if (l == 3) curGram = cur3Gram;
	else if (l == 4) curGram = cur4Gram;

	// check for 2grams
	if (curGram.length == l) {
		curGram.shift();
		curGram.push(w);
		common.mongo.collection('unique_'+l+'grams', function(e, c) {
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
		curGram.push(w);
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

function sendWord(cb, t, wid, w, punctuationF, wcats, numInstances, ngramsArr)
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

  common.sendMessage(message, true);
  cb(null);
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
	//console.log("SENTENCE END!!");
	var message = {
		type: "sentenceEnd",
		timeDiff: t,
		speaker: curSpeakerID,
		sentiment: senti,
		length: l
	};
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
