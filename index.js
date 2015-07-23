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
 * + deleteOriginal - deletes a document and, if append_only is set, stores a new version in the shadow collection with the (optional) deleteFlag set to true
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
    , versionOfIdPath = options.versionOfIdPath || 'versionOfId'
    , versionVirtualPath = options.versionVirtualPath || 'versionVirtual'
    , hookWanted = options.hookWanted
    , append_only = options.append_only // 'full' append-only mode, no version check is performed at all, always a new version created
		, hookVirtual
		, deleteFlag = options.delete_flag // this flag gets added to the shadow schema and is set when deleteOriginal is called
		// the collection flag is used to specify the collection name, which can be useful in combination with discriminators
		, collection = options.collection
		, schema_options = {};

	if( collection ) schema_options.collection = collection;

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
	if( deleteFlag && ! shadowFields[deleteFlag] ) {
    shadowFields[deleteFlag] = {type:Boolean};
	}

  // versionId holds a reference to the versioned document that is "active"
  if (!schema.paths[versionIdPath]) {
    fields[versionIdPath] = {type:Schema.ObjectId};
  }
  schema.add(fields);

  var shadowSchema = new mongoose.Schema(shadowFields, schema_options),
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

  /**
   * upsertVersion
   *
   * NOTE: This function should be used to save all documents in place of
   * the original schema's save() method.
   *
   * This function is a lightweight version of saveVersion to be used in 
   * append-only situations when the application logic does not cater for 
   * modifying not-active i.e. previous versions.
   *
   * If dataObj's _id is null i.e. undefined it creates a new document
   * if _id exists it uses findAndModify to ensure that the active version
   * gets modified. An attempt to modify a not-active version of a document
   * will result in an error.
   * In both cases (save or findAndModify) a new shadow document is created.
	 *
	 * The optional query object has been added to support atomicity in create
	 * mode, so when no object id is present. An example use case is to compute
	 * a check sum of the relevant fields of the document which is the used
	 * in the findOneAndModify call which replaced the update().
   *
   * @param {Object} dataObj    The data to save
	 * @param {Object} query      Optional query object
   * @param {Function} callback
   */
  schema.statics.upsertVersion = function (dataObj, query, callback) {
    var model = mongoose.model(modelName);
		if( ! callback ) {
			callback = query;
			query = null;
		}

    function create_shadow(originalObj, callback) {
			var input = {}, versDoc;
			if( originalObj instanceof model ) {
				input = originalObj.toObject();
			} else {
				Object.keys(originalObj).forEach(function(key) {
					input[key] = originalObj[key];
				});
			}
			delete input._id;
      var versDoc = new shadowModel(input);
			versDoc[versionOfIdPath] = originalObj._id.toString();
			versDoc.save(function(err, versSaved) {
				if( err ) return callback(err);
				callback(undefined, versSaved);
			});
		}
			
		if( ! dataObj._id ) {
			// 1) Create a new document
			var original = new model(dataObj);
			// 2) Create a new shadow object
			create_shadow(original, function(err, versSaved) {
				if( err ) return callback(err);
				// 3) Pass the shadow version to the original document and create it
				original[versionIdPath] = versSaved._id.toString();
				model.findOneAndUpdate( query || { _id: original._id }, { $setOnInsert: original }, { upsert: true, new: false }, function(err, doc) {
					if( err ) {
						versSaved.remove();
						return callback(err);
					}
					// With new = false above doc will be null if a new document was inserted.
					// If doc is not null the insert did not take place because of the $setOnInsert above,
					// so the version document should be removed again.
					if( doc ) versSaved.remove();
					callback(undefined, doc || original);
				});
			});
		} else {
			// Updating an existing document
			if( ! append_only && ! dataObj[versionIdPath] ) return callback(new Error('Please specify the revision you would like to change.'));
			// 1) Create a new shadow object
			create_shadow(dataObj, function(err, versSaved) {
				if( err ) return callback(err);
				var query = { _id: dataObj._id.toString() };
				if( ! append_only ) query[versionIdPath] = dataObj[versionIdPath];
				dataObj[versionIdPath] = versSaved._id.toString();
				// 2) Update the original object (if the provided revision matches the actual revision)
				model.findOneAndUpdate(query, dataObj, function(err, origSaved) {
					if( err ) {
						versSaved.remove();
						return callback(err);
					}
					if( ! origSaved ) {
						versSaved.remove();
						return callback(new Error('Your copy of the data set with revision ' + query[versionIdPath] + ' is not up-to-date, please refresh first, then try again.'));
					}
					callback(undefined, origSaved);
				});
			});
		}
	};
  
  /**
   * deleteOriginal
   *
   * This function can be used to delete a document but leave the shadow versions intact
   * optionally setting a delete flag on the active version (i.e. create a new one in append_only mode)
   *
   * @param {Object} queryObj   (including versionIdPath unless append_only)
   * @param {Object} dataObj    optional data object to set some attributes on the (newly created) shadow, like modified_at, by...
   * @param {Function} callback
   */
  schema.statics.deleteOriginal = function (queryObj, dataObj, callback) {
    var model = mongoose.model(modelName);

		if( ! callback ) {
			callback = dataObj;
			dataObj = undefined;
		}
		if( ! append_only && ! queryObj[versionIdPath] ) return callback('Please specify the revision you would like to change.');
		// 1) Retrieve the original
		model.find(queryObj, function(err, origs) {
			if( err ) return callback(err);
			if( ! origs || ! origs.length ) return callback(new Error('Your copy of the data set with revision ' + queryObj[versionIdPath] + ' is not up-to-date, please refresh first, then try again.'));
			if( origs.length > 1 ) return callback(new Error('Cannot delete more than one document.'));
			var origSaved = origs[0],
				origObj = origSaved.toObject();
			origObj[versionOfIdPath] = origObj._id.toString();
			delete origObj._id;
			delete origObj[versionIdPath];
			if( schema.options.versionKey ) delete origObj[schema.options.versionKey];
			if( deleteFlag ) origObj[deleteFlag] = true;
			if( dataObj ) {
				Object.keys(dataObj).forEach(function(key) {
					origObj[key] = dataObj[key];
				});
			}
			// 2) Create the new version i.e. update the existing one
			if( append_only ) {
      	var versDoc = new shadowModel(origObj);
				versDoc.save(function(err, versSaved) {
					if( err ) return callback(err);
					// 3) Delete original
					model.remove({ _id: origSaved._id.toString() }, function(err) {
						if( err ) {
							versSaved.remove();
							return callback(err);
						}
						callback();
					});
				});
			} else if( deleteFlag ) {
				var query = { _id: queryObj[versionIdPath] },
					data = {};
				data[deleteFlag] = true;
				shadowModel.findOneAndUpdate(query, data , function(err, savedVersion) {
					if( err ) return callback(err);
					if( ! savedVersion ) return callback(new Error('Your version documents are inconsistent.'));
					// 3) Delete original
					model.remove({ _id: origSaved._id.toString() }, function(err) {
						if( err ) {
							versSaved.remove();
							return callback(err);
						}
						callback();
					});
				});
			} else {
				// Nothing to do
				callback(new Error('Do not know what to do, both append_only and delete_flag are not set.'));
			}
		});
	};

  //-------------------------------------------------------------------------
  // Middleware
  //

	/*
   * This is the attempt to provide a upsertVersion on document level using pre-save and post-save hooks.
   * The concept is the same as in the static upsertVersion function.
   * The only caveat is the fact that upon failure of storing the shadowDoc there is no way of returning an error.
 	*/
	if( hookWanted ) {
		hookVirtual = schema.virtual(versionVirtualPath);
		hookVirtual.getters.push(function() {
			return this['_' + versionVirtualPath];
		});
		hookVirtual.setters.push(function(versDoc) {
			this['_' + versionVirtualPath] = versDoc;
		});
		schema.pre('save', function(next) {
			var origDoc = this, input = this.toObject(), fields = {}, shadowDoc,
    		model = mongoose.model(modelName);
			delete input._id;
			delete input[versionIdPath];
			if( schema.options.versionKey ) delete input[schema.options.versionKey];
			// 1) Check if we are current
			fields[versionIdPath] = 1;
			if( ! append_only ) {
				model.findById(this._id, fields, function(err, origSaved) {
					if( err ) {
						return next(err.message ? err : new Error(err));
					}
					if( origSaved && ( ! origDoc[versionIdPath] || origDoc[versionIdPath].toString() !== origSaved[versionIdPath].toString() ) ) {
						return next(new Error('Your copy of the data set with revision ' + origDoc[versionIdPath] + ' is not up-to-date, please refresh first, then try again.'));
					}
					// 2) Create the shadow document
					input[versionOfIdPath] = origDoc._id.toString();
					shadowDoc = new shadowModel(input); // the shadow doc needs to be fully fleshed to meet all Schema requirements
					origDoc[versionIdPath] = shadowDoc._id.toString();
					origDoc[versionVirtualPath] = shadowDoc;
					next();
				});
			} else {
				// 2) Create the shadow document
				input[versionOfIdPath] = origDoc._id.toString();
				shadowDoc = new shadowModel(input); // the shadow doc needs to be fully fleshed to meet all Schema requirements
				origDoc[versionIdPath] = shadowDoc._id.toString();
				origDoc[versionVirtualPath] = shadowDoc;
				next();
			}
		});
		schema.post('save', function() {
			// 3) Update the shadow document's values and save it
			var input = this.toObject(), shadowDoc = this[versionVirtualPath];
      for (var key in input) {
        if (key !== '_id' && key !== versionOfIdPath && key !== schema.options.versionKey) {
          shadowDoc[key] = input[key];
        }
      }
			shadowDoc.save(function(err, versSaved) {
				// Or better throw an Error here?
				if( err ) console.error('Error saving the version document: ' + ( err.message || err ));
			});
		});
	}

};
