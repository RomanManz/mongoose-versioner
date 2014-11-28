/**
 * # Mongoose Versioner Plugin
 *
 * version: 0.2
 *
 * ## Introduction
 *
 * This is a Mongoose plugin that, when applied to a model,
 * adds the ability to version a document. All document versions are
 * stored in a shadow collection with a shallow clone of the active
 * version's data residing in the original model.
 *
 * The original model is queried as normal when searching for
 * documents.  The shadow collection is only used by your CRUD system
 * through the use of static methods added to the model's schema
 * by this plugin.
 *
 * Support multiple mongoose instances.
 *
 * Properties added to the original schema:
 * * versionId {ObjectId} Id of the active version in the shadow collection
 *
 * Instance methods added to the original schema:
 * * findVersions - returns all versions of this document
 *
 * Static Methods added to the original schema:
 * * findVersionById - returns a document version matching the id in the shadow collection
 * * findVersions - returns all document versions matching the id of the active document in original collection
 * * saveVersion - saves a document as a version
 * * deleteVersion - deletes a document version
 * * activateVersion - make a document version the active version
 *
 * Properties added to the shadow schema:
 * * versionOfId {ObjectId} Id of the document this version is linked to
 *
 * ## Usage
 * Install the plugin on the model you want to version.
 *
 * ```js
 * // models/foo.js
 *
 * var mongoose = require('mongoose')
 *   , versioner = require('mongoose-versioner')
 *   , FooSchema = new mongoose.Schema({
 *     title: {'type': String, 'default': 'Untitled'},
 *   });
 *
 * FooSchema.plugin(versioner, {modelName:'Foo', mongoose:mongoose});
 *
 * module.exports = mongoose.model('Foo', FooSchema);
 * ```
 *
 * Versioner options
 * ```js
 * {
 *   // (required)
 *   // the name of the collection you are versioning.
 *   // This will be used to name the shadow collection
 *   // Must be the same used in mongoose.model call
 *   modelName : String,
 *   // (required)
 *   // a reference to the mongoose object
 *   mongoose : require("mongoose")
 * }
 * ```
 *
 * ## API
 */

/*
 * @param {Schema} schema
 * @param {Object} options
 */
module.exports = function (schema, options) {

  'use strict';

  if (!options || !options.mongoose) {
    throw new Error('mongoose-versioner requires mongoose to be passed in as an options reference.');
  }

  var mongoose = options.mongoose
    , Schema = mongoose.Schema
    , modelName = options.modelName
    , shadowName = modelName + 'Shadow'
    , fields = {}
    , versionIdPath = options.versionIdPath || 'versionId'
    , shadowFields = {}
    , versionOfIdPath = options.versionOfIdPath || 'versionOfId';

  // Clone the schema to a shadowSchema
  schema.eachPath(function (key, value) {
    if (key !== '_id') {
      shadowFields[key] = value.options;
    }
  });

  // versionOfId holds a reference to the original document being versioned
  if (shadowFields[versionOfIdPath]) {
    throw new Error('options.versionOfIdPath [' + versionOfIdPath + '] must not be declared in the schema');
  }

  shadowFields[versionOfIdPath] = {type: Schema.ObjectId};

  // versionId holds a reference to the versioned document that is "active"
  if (schema.paths[versionIdPath]) {
    throw new Error('options.versionIdPath [' + versionIdPath + '] must be declared in the schema by mongoose-versioner');
  }

  fields[versionIdPath] = {type: Schema.ObjectId};

  schema.add(fields);

  var shadowSchema = new mongoose.Schema(shadowFields);

  function getShadowModel(conn) {
    try {
      var mdl = conn.model(shadowName);
      return mdl;
    } catch(e) {
      return conn.model(shadowName, shadowSchema);
    }
  }

  //-------------------------------------------------------------------------
  // Instance Methods
  //

  /**
   * (@instance).findVersions
   *
   * When you have an instance to a document, calling this instance method
   * will return a list of document versions available for this document.
   *
   * @name findVersions
   * @param {Function} callback
   * @return {Query}
   */
  function instanceFindVersions(callback) {
    var shadowModel = getShadowModel(this.db),
      filter = {};

    filter[versionOfIdPath] = this._id;

    return shadowModel.find(filter, function (err, result) {
      callback(err, result);
    });
  };
  schema.methods.findVersions = instanceFindVersions;

  //-------------------------------------------------------------------------
  // Class Methods
  //

  /**
   * (@model).findVersionById
   *
   * Returns a specific document version by Id
   *
   * @param {ObjectId} id   The Id of the document in the shadow schema
   * @param {Object} fields optional fields to select (forwarded to findById)
   * @param {Object} options (forwarded to findById)
   * @param {Function} callback
   * @return {Query}
   */
  function findVersionById(id, fields, options, callback) {
    var shadowModel = getShadowModel(this.base);

    return shadowModel.findById(id, fields, options, callback);
  };
  schema.statics.findVersionById = findVersionById;

  /**
   * (@model).findVersions
   *
   * Returns a collection of document versions that
   * are linked as to the document with the passed in Id.
   *
   * @param {ObjectId} id   The Id of the active document in the original schema
   * @param {Object} fields optional fields to select (forwarded to findById)
   * @param {Object} options (forwarded to findById)
   * @param {Function} callback
   * @return {Model} this
   */
  function findVersions(id, fields, options, callback) {

    var model = this.base.model(modelName),
      shadowModel = getShadowModel(this.base),
      returnObj = {
        activeId:null,
        docs:[]
      };

    model.findById(id, fields, options, function (err, activeDoc) {
      if (err) {
        return callback(err);
      }

      if (activeDoc === null) {
        return callback(err, returnObj);
      }

      returnObj.activeId = activeDoc[versionIdPath];

      var filter = {};
      filter[versionOfIdPath] = activeDoc._id;
      shadowModel.find(filter, fields, options, function (err, result) {
        if (err) {
          return callback(err);
        }

        returnObj.docs = result;
        callback(err, returnObj);
      });
    });

    return this;
  };
  schema.statics.findVersions = findVersions;
  /**
   * (@model).saveNewVersionOf
   *
   * Shorthand to saveVersion
   *
   * @param {ObjectId} versionOfId
   * @param {Object|Model} dataObj    The data to save
   * @param {Function} callback
   * @return {Model} this
   */
  function saveNewVersionOf(versionOfId, data, callback) {
    var dataObj = {
      data: data,
      // always create a new version?
      versionId: null,
      versionOfId: versionOfId
    };

    return this.saveVersion(dataObj, callback);
  };
  schema.statics.saveNewVersionOf = saveNewVersionOf;

  /**
   * (@model).saveVersion
   *
   * **NOTE**: This function should be used to save all documents in place of
   * the original schema's save() method.
   *
   * This function will first check to see if the document exists in
   * the original schema and create it there if it does not.
   *
   * Then, using this document reference, also create a version and store
   * it in the shadow collection linking it back to this reference.
   *
   * **dataObj**
   * ```js
   * {
   *   // data that will be stored, model
   *   data: data,
   *   // null - to create a new version
   *   // ObjectId - overwrite given version
   *   versionId: null,
   *   versionOfId: original_doc._id
   * }
   * ```
   *
   * @param {Object} dataObj The data to save
   * @param {Function} callback
   * @return {Model} this
   */
  function saveVersion(dataObj, callback) {

    var model = this.base.model(modelName),
      shadowModel = getShadowModel(this.base);


    // 1) First look to see if this document exists
    shadowModel.findById(dataObj.versionId, function (err, versDoc) {
      if (err) {
        return callback(err);
      }

      // is data a model? then toObject will be defined as function.
      var data = dataObj.data;
      if ("function" === data.toObject) {
        data = data.toObject();
      }

      if (versDoc === null) {
        // Document doesn't exist so create a new one
        versDoc = new shadowModel(data);
      } else {
        // Document does exist so copy data to it
        for (var key in data) {
          versDoc[key] = data[key];
        }
      }
      versDoc.versionOfId = dataObj.versionOfId || null;
      // 2) Save this as a Version
      versDoc.save(function (err, versSaved) {

        if (err) {
          return callback(err);
        }

        var versDocObj = versSaved.toObject();

        // 2) Lookup the Active version
        model.findById(dataObj.versionOfId, function (err, original) {

          if (err) {
            return callback(err);
          }

          // 3) If the Active version doesn't exist, create a new object
          if (original === null) {
            original = new model();
            original[versionIdPath] = versSaved._id;
          }
          // 4) If the Active version is the Version we are editing, then update it
          if (original[versionIdPath].toString() !== versSaved._id.toString()) {
            return callback(null, versSaved);
          }

          // 4a) Copy all of the properties from the Version to the Active document
          var versDocObj = versSaved.toObject();
          for (var key in versDocObj) {
            if (key !== '_id' && key !== versionOfIdPath) {
              original[key] = versDocObj[key];
            }
          }
          // 4b) Save the Active document with the newly updated props
          original.save(function (err, originalSaved) {

            if (err || versDocObj[versionOfIdPath] === originalSaved._id) {
              return callback(err);
            }

            // 5) If this was a new document save Version again with ref to Active document
            versSaved[versionOfIdPath] = originalSaved._id;
            versSaved.save(function (err, versSavedAgain) {
              callback(err, versSavedAgain);
            });

          });
        });
      });
    });

    return this;
  };
  schema.statics.saveVersion = saveVersion;

  /**
   * (@model).deleteVersion
   *
   * This function will delete a document version from the shadow
   * collection provided it isn't linked as the active document.
   *
   * An object will be passed to the callback function with a
   * 'success' property with the value true if it deleted the
   * version and false if it did not.
   *
   * @param {ObjectId} id   The Id of the document version to delete
   * @param {Function} callback
   * @return {Model} this
   */
  function deleteVersion(id, callback) {
    var model = this.base.model(modelName),
      shadowModel = getShadowModel(this.base),
      filter = {};

    // 1) Check to see if this Version is an Active document
    filter[versionIdPath] = id;
    model.findOne(filter, function (err, result) {
      if (err) {
        return callback(err);
      }

      if (result !== null) {
        // 2b) Document found so it must be Active and therefore not safe to delete.
        return callback(null, {'success':false});
      }

      // 2a) Document not found so it's not Active.  Safe to delete.
      shadowModel.findById(id, function (err, version) {
        if (err) {
          return callback(err);
        }

        if (version === null) {
          return callback(null, {'success':false});
        }

        version.remove(function (err, version) {
          if (err) {
            return callback(err);
          }

          return callback(null, {'success':true});
        });

      });
    });

    return this;
  };
  schema.statics.deleteVersion = deleteVersion;

  /**
   * (@model).activateVersion
   *
   * This function will set a document version as the active version
   * by cloning it's data to the original collection and updating the
   * active version pointer.
   *
   * @param {ObjectId} id   The Id of the version document to activate
   * @param {Function} callback
   * @return {Model} this
   */
  function activateVersion(id, callback) {
    var model = this.base.model(modelName),
      shadowModel = getShadowModel(this.base);

    // 1) First look to see if this document exists
    shadowModel.findById(id, function (err, result) {
      if (err) {
        return callback(err);
      }

      if (result === null) {
        return callback({'success':false});
      }

      // 2) Find the Active document
      model.findById(result[versionOfIdPath], function (err, active) {
        if (err) {
          return callback(err);
        }

        if (active === null) {
          return callback({'success':false});
        }

        // 3) Copy all of the properties from the Version to the Active document
        var versDocObj = result.toObject(),
          key;

        for (key in versDocObj) {
          if (key !== '_id' && key !== versionOfIdPath) {
            active[key] = versDocObj[key];
          }
        }
        // 4) Set the version pointer to the Version we are activating
        active[versionIdPath] = id;
        active.save(function (err, activeSaved) {
          return callback(err, activeSaved);
        });

      });

    });

    return this;
  };
  schema.statics.activateVersion = activateVersion;
};