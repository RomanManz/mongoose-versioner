# Mongoose-Versioner

version: 0.1.1

## Introduction

This is a Mongoose plugin that, when applied to a model, will provide
the ability to create multiple versions of a document and set one of
the versions as the active document.

All of the document versions are stored in a dynamically created shadow
collection and the active document is stored in your originally created
collection.

## Usage

Install the plugin on the model you want to version.

```
// models/foo.js

var mongoose = require('mongoose')
  , versioner = require('mongoose-versioner')
  , FooSchema = new mongoose.Schema({
    title: {'type': String, 'default': 'Untitled'},
  });

FooSchema.plugin(versioner, {modelName:'Foo', mongoose:mongoose});

module.exports = mongoose.model('Foo', FooSchema);
```

## API

### Options
- *modelName* : the name of the collection you are versioning.  This
will be used to name the shadow collection (required)
- *mongoose* : a reference to the mongoose object (required)

### Instance Methods added to the original schema:
- findVersions(callback) returns all versions of this document

### Static Methods added to the original schema:
- *findVersionById*(id, fields, options, callback) returns a document version
  matching the id in the shadow collection
- *findVersions*(id, fields, options, callback) returns all document versions
  matching the id of the active document in original collection
- *saveVersion*(dataObj, callback) saves a document as a version
- *deleteVersion*(id, callback) deletes a document version
- *activateVersion*(id, callback) make a document version the active version

NOTE: When using this plugin it is expected that all public facing queries
would be performed on your models using mongoose in the traditional
way.  These static methods are for you to use in your CMS when content
creators are editing their documents.

## Todo

- API documentation
- Add test scripts

## License

Copyright (c) 2013 James O'Reilly &lt;james@jamesor.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.