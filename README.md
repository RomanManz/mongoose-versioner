
# Mongoose Versioner Plugin

version: 0.2

## Introduction

This is a Mongoose plugin that, when applied to a model,
adds the ability to version a document. All document versions are
stored in a shadow collection with a shallow clone of the active
version's data residing in the original model.

The original model is queried as normal when searching for
documents.  The shadow collection is only used by your CRUD system
through the use of static methods added to the model's schema
by this plugin.

Support multiple mongoose instances.

Properties added to the original schema:
* versionId {ObjectId} Id of the active version in the shadow collection

Instance methods added to the original schema:
* findVersions - returns all versions of this document

Static Methods added to the original schema:
* findVersionById - returns a document version matching the id in the shadow collection
* findVersions - returns all document versions matching the id of the active document in original collection
* saveVersion - saves a document as a version
* deleteVersion - deletes a document version
* activateVersion - make a document version the active version

Properties added to the shadow schema:
* versionOfId {ObjectId} Id of the document this version is linked to

## Usage
Install the plugin on the model you want to version.

```js
// models/foo.js

var mongoose = require('mongoose')
, versioner = require('mongoose-versioner')
, FooSchema = new mongoose.Schema({
title: {'type': String, 'default': 'Untitled'},
});

FooSchema.plugin(versioner, {modelName:'Foo', mongoose:mongoose});

module.exports = mongoose.model('Foo', FooSchema);
```

Versioner options
```js
{
// (required)
// the name of the collection you are versioning.
// This will be used to name the shadow collection
// Must be the same used in mongoose.model call
modelName : String,
// (required)
// a reference to the mongoose object
mongoose : require("mongoose")
}
```

## API
 


##### `findVersions` (Function:callback) -> undefined

(@instance).findVersions

When you have an instance to a document, calling this instance method
will return a list of document versions available for this document.

**Parameters:**

* `callback`


**Returns:**

* `Query`




##### `findVersionById` (ObjectId:id, Object:fields, Object:options, Function:callback) -> undefined

(@model).findVersionById

Returns a specific document version by Id

**Parameters:**

* `id`: The Id of the document in the shadow schema

* `fields`: optional fields to select (forwarded to findById)

* `options`: (forwarded to findById)

* `callback`


**Returns:**

* `Query`




##### `findVersions` (ObjectId:id, Object:fields, Object:options, Function:callback) -> undefined

(@model).findVersions

Returns a collection of document versions that
are linked as to the document with the passed in Id.

**Parameters:**

* `id`: The Id of the active document in the original schema

* `fields`: optional fields to select (forwarded to findById)

* `options`: (forwarded to findById)

* `callback`


**Returns:**

* `Model`: this




##### `saveNewVersionOf` (ObjectId:versionOfId, data, Function:callback) -> undefined

(@model).saveNewVersionOf

Shorthand to saveVersion

**Parameters:**

* `versionOfId`

* `dataObj`: The data to save

* `callback`


**Returns:**

* `Model`: this




##### `saveVersion` (Object:dataObj, Function:callback) -> undefined

(@model).saveVersion

**NOTE**: This function should be used to save all documents in place of
the original schema's save() method.

This function will first check to see if the document exists in
the original schema and create it there if it does not.

Then, using this document reference, also create a version and store
it in the shadow collection linking it back to this reference.

**dataObj**
```js
{
  // data that will be stored, model
  data: data,
  // null - to create a new version
  // ObjectId - overwrite given version
  versionId: null,
  versionOfId: original_doc._id
}
```

**Parameters:**

* `dataObj`: The data to save

* `callback`


**Returns:**

* `Model`: this




##### `deleteVersion` (ObjectId:id, Function:callback) -> undefined

(@model).deleteVersion

This function will delete a document version from the shadow
collection provided it isn't linked as the active document.

An object will be passed to the callback function with a
'success' property with the value true if it deleted the
version and false if it did not.

**Parameters:**

* `id`: The Id of the document version to delete

* `callback`


**Returns:**

* `Model`: this




##### `activateVersion` (ObjectId:id, Function:callback) -> undefined

(@model).activateVersion

This function will set a document version as the active version
by cloning it's data to the original collection and updating the
active version pointer.

**Parameters:**

* `id`: The Id of the version document to activate

* `callback`


**Returns:**

* `Model`: this




# TODO

* Add test scripts (PR welcome)


# LICENSE

(The MIT License)

Copyright (c) 2013 James O'Reilly <james@jamesor.com> until 0.1.1

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

