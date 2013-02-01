function deleteVersion(id, url) {
  'use strict';

  if (confirm('Are you sure you wish to delete this item?')) {
    var $el = $('#' + id);
    $.ajax({
      url:url,
      type:'DELETE',
      success:function (data, textStatus, jqXHR) {
        if (data.success) {
          $el.fadeOut('slow', function () {
            $el.remove();
          });
        }
      },
      error:function (jqXHR, textStatus, errorThrown) {
        //console.log(arguments);
      }
    });
  }
}