(function (exports) {

  'use strict';

  var async = require('async'),
    _ = require('underscore'),
    uuid = require('node-uuid'),
    mongoose = require('mongoose'),
    Story = mongoose.model('Story');

  function errMsg(msg) {
    return {'error':{'message':msg.toString()}};
  }

  function item_list(req, res) {
    Story.find({}, function (err, result) {
      if (err) {
        res.send(errMsg(err));
      } else {
        res.render('index', {title:'Documents', stories:result});
      }
    });
  }

  function item_new(req, res) {
    res.render('story', {title:'Create Document', item:{_id:'', title:'', deck:'', versions:[]}});
  }

  function item_read(req, res) {
    Story.findVersionById(req.params.vid, null, null, function (err, result) {
      if (err) {
        res.send(errMsg(err));
      } else {
        Story.findVersions(result.versionOfId, null, null, function (err, versions) {
          if (err) {
            res.send(errMsg(err));
          } else {
            res.render('story', {title:'Edit Document', item:result, versions:versions, selectedId:req.params.vid});
          }
        });
      }
    });
  }

  function item_save(req, res) {
    var dataObj = {
      data:req.body,
      versionId:req.params.vid,
      versionOfId:req.params.id
    };

    if (req.body.saveAsNewVersion === 'true') {
      delete dataObj.data.saveAsNewVersion;
      dataObj.versionId = null;
    }

    dataObj.data.updated = new Date();

    Story.saveVersion(dataObj, function (err, version) {
      if (err) {
        res.send(errMsg(err));
      } else {
        res.redirect("/story/" + version.versionOfId + "/v/" + version._id);
      }
    });
  }

  function item_delete(req, res) {
    Story.deleteVersion(req.params.vid, function (err, result) {
      if (err) {
        res.send({'success':false});
      } else {
        res.send(result);
      }
    });
  }

  function item_activate(req, res) {
    Story.activateVersion(req.params.vid, function (err, result) {
      if (err || result === null) {
        res.send({'success':false});
      } else {
        res.redirect("/story/" + result._id + "/v/" + result.versionId);
      }
    });
  }

  exports.init = function (app) {
    app.get('/', item_list);
    app.get('/story', item_new);
    app.post('/story', item_save);
    app.get('/story/:id/v/:vid', item_read);
    app.post('/story/:id/v/:vid', item_save);
    app.del('/story/:id/v/:vid', item_delete);
    app.get('/story/:id/v/:vid/activate', item_activate);
  };

})(exports);