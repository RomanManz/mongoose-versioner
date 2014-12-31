/**
 * Mongoose Versioner Plugin
 *
 * Adds the ability to version a document.  All document versions are
 * stored in a shadow collection with a shallow clone of the active
 * version's data residing in the original model.
 *
 * The original model is queried as normal when searching for
 * documents.  The shadow collection is only used by your CRUD system
 * through the use of static methods added to the model's schema
 * by this plugin.
 *
 * Property added to the original schema:
 * + versionId {ObjectId} Id of the active version in the shadow collection
 *
 * Instance Methods added to the original schema:
 * + findVersions - returns all versions of this document
 *
 * Static Methods added to the original schema:
 * + findVersionById - returns a document version matching the id
 * + findVersions - returns all document versions matching query
 * + saveVersion - saves a document as a version
 * + deleteVersion - deletes a document version
 * + activateVersion - make a document version the active version
 *
 * Property added to the shadow schema:
 * + versionOfId {ObjectId} Id of the document this version is linked to
 *
 * @param {Schema} schema
 * @param {Object} options
 */
module.exports = function (schema, options) {

  'use strict';

  if (!options || !options.mongoose) {
    console.log('mongoose-versioner requires mongoose to be passed in as an options reference.');
    return;
  }

  var mongoose = options.mongoose
    , Schema = mongoose.Schema
    , modelName = options.modelName
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
  if (!shadowFields[versionOfIdPath]) {
    shadowFields[versionOfIdPath] = {type:Schema.ObjectId};
  }

  // versionId holds a reference to the versioned document that is "active"
  if (!schema.paths[versionIdPath]) {
    fields[versionIdPath] = {type:Schema.ObjectId};
  }
  schema.add(fields);

  var shadowSchema = new mongoose.Schema(shadowFields),
    shadowModel = mongoose.model(modelName + 'Shadow', shadowSchema);

  //-------------------------------------------------------------------------
  // Instance Methods
  //

  /**
   * findVersions
   *
   * When you have an instance to a document, calling this instance method
   * will return a list of document versions available for this document.
   *
   * @param callback
   * @return {Query}
   */
  schema.methods.findVersions = function (callback) {
    var filter = {};
    filter[versionOfIdPath] = this._id;
    return shadowModel.find(filter, function (err, result) {
      callback(err, result);
    });
  };

  //-------------------------------------------------------------------------
  // Class Methods
  //

  /**
   * findVersionById
   *
   * Returns a specific document version by Id
   *
   * @param {ObjectId} id   The Id of the document in the shadow schema
   * @param fields
   * @param options
   * @param {Function} callback
   * @return {Query}
   */
  schema.statics.findVersionById = function (id, fields, options, callback) {
    return shadowModel.findById(id, fields, options, callback);
  };

  /**
   * findVersions
   *
   * Returns a collection of document versions that
   * are linked as to the document with the passed in Id.
   *
   * @param {ObjectId} id   The Id of the active document in the original schema
   * @param fields
   * @param options
   * @param {Function} callback
   */
  schema.statics.findVersions = function (id, fields, options, callback) {
    var model = mongoose.model(modelName),
      returnObj = {
        activeId:null,
        docs:[]
      };

    model.findById(id, fields, options, function (err, activeDoc) {
      if (err) {
        callback(err);
      } else if (activeDoc === null) {
        callback(err, returnObj);
      } else {
        returnObj.activeId = activeDoc[versionIdPath];
        var filter = {};
        filter[versionOfIdPath] = activeDoc._id;
        shadowModel.find(filter, fields, options, function (err, result) {
          if (err) {
            callback(err);
          } else {
            returnObj.docs = result;
            callback(err, returnObj);
          }
        });
      }
    });
  };

  /**
   * saveVersion
   *
   * NOTE: This function should be used to save all documents in place of
   * the original schema's save() method.
   *
   * This function will first check to see if the document exists in
   * the original schema and create it there if it does not.
   *
   * Then, using this document reference, also create a version and store
   * it in the shadow collection linking it back to this reference.
   *
   * @param {Object} dataObj    The data to save
   * @param {Function} callback
   */
  schema.statics.saveVersion = function (dataObj, callback) {

    // 1) First look to see if this document exists
    shadowModel.findById(dataObj.versionId, function (err, result) {
      if (err) {
        callback(err);
      } else {
        var versDoc = result;
        if (versDoc === null) {
          // Document doesn't exist so create a new one
          versDoc = new shadowModel(dataObj.data);
        } else {
          // Document does exist so copy data to it
          for (var key in dataObj.data) {
            versDoc[key] = dataObj.data[key];
          }
        }
        versDoc.versionOfId = dataObj.versionOfId || null;
        // 2) Save this as a Version
        versDoc.save(function (err, versSaved) {
          if (err) {
            callback(err);
          } else {
            var versDocObj = versSaved.toObject(),
              model = mongoose.model(modelName);
            // 2) Lookup the Active version
            model.findById(dataObj.versionOfId, function (err, original) {
              if (err) {
                callback(err);
              } else {
                // 3) If the Active version doesn't exist, create a new object
                if (original === null) {
                  original = new model();
                  original[versionIdPath] = versSaved._id;
                }
                // 4) If the Active version is the Version we are editing, then update it
                if (original[versionIdPath].toString() == versSaved._id.toString()) {
                  // 4a) Copy all of the properties from the Version to the Active document
                  var versDocObj = versSaved.toObject();
                  for (var key in versDocObj) {
                    if (key !== '_id' && key !== versionOfIdPath && key !== schema.options.versionKey) {
                      original[key] = versDocObj[key];
                    }
                  }
                  // 4b) Save the Active document with the newly updated props
                  original.save(function (err, originalSaved) {
                    if (err) {
                      callback(err);
                    } else if (versDocObj[versionOfIdPath] !== originalSaved._id) {
                      // 5) If this was a new document save Version again with ref to Active document
                      versSaved[versionOfIdPath] = originalSaved._id;
                      versSaved.save(function (err, versSavedAgain) {
                        callback(err, versSavedAgain);
                      });
                    } else {
                      callback(null, versSaved);
                    }
                  });
                } else {
                  callback(null, versSaved);
                }
              }
            });
          }
        });
      }
    });
  };

  /**
   * deleteVersion
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
   */
  schema.statics.deleteVersion = function (id, callback) {
    var model = mongoose.model(modelName),
      filter = {};

    // 1) Check to see if this Version is an Active document
    filter[versionIdPath] = id;
    model.findOne(filter, function (err, result) {
      if (err) {
        callback(err);
      } else if (result === null) {
        // 2a) Document not found so it's not Active.  Safe to delete.
        shadowModel.findById(id, function (err, version) {
          if (err) {
            callback(err);
          } else if (version === null) {
            callback(null, {'success':false});
          } else {
            version.remove(function (err, version) {
              if (err) {
                callback(err);
              } else {
                callback(null, {'success':true});
              }
            });
          }
        });
      } else {
        // 2b) Document found so it must be Active and therefore not safe to delete.
        callback(null, {'success':false});
      }
    });
  };

  /**
   * activateVersion
   *
   * This function will set a document version as the active version
   * by cloning it's data to the original collection and updating the
   * active version pointer.
   *
   * @param {ObjectId} id   The Id of the version document to activate
   * @param {Function} callback
   */
  schema.statics.activateVersion = function (id, callback) {
    // 1) First look to see if this document exists
    shadowModel.findById(id, function (err, result) {
      if (err) {
        callback(err);
      } else if (result === null) {
        callback({'success':false});
      } else {
        var model = mongoose.model(modelName);
        // 2) Find the Active document
        model.findById(result[versionOfIdPath], function (err, active) {
          if (err) {
            callback(err);
          } else if (active === null) {
            callback({'success':false});
          } else {
            // 3) Copy all of the properties from the Version to the Active document
            var versDocObj = result.toObject();
            for (var key in versDocObj) {
              if (key !== '_id' && key !== versionOfIdPath && key !== schema.options.versionKey) {
                active[key] = versDocObj[key];
              }
            }
            // 4) Set the version pointer to the Version we are activating
            active[versionIdPath] = id;
            active.save(function (err, activeSaved) {
              callback(err, activeSaved);
            });
          }
        });
      }
    });
  };
};
