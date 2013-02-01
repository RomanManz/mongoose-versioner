var mongoose = require('mongoose')
  , versioner = require('../../index')

  , StorySchema = new mongoose.Schema({
    title: {'type': String, 'default': 'Untitled Story'},
    deck: {'type': String, 'default': ''},
    created: {'type': Date, 'default': function () { return new Date(); }},
    updated: {'type': Date, 'default': function () { return new Date(); }}
  });

StorySchema.plugin(versioner, {modelName:'Story', mongoose:mongoose});

module.exports = mongoose.model('Story', StorySchema);