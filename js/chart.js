var chart;
var rentals;
$(function () {
    $("#login").submit(function () {
        $.ajax({
            type: "GET",
            url: "/rentals",
            dataType: 'json',
            async: true,
            username: $("#username").val(),
            password: $("#password").val(),
            success: function(data) {
                if (data.error) {
                    alert(data.error);

                    $("#login").show();
                    $("#loading").hide();
                } else {
                    rentals = data;
                    showStations();
                }
            }
        });

        $("#login").hide();
        $("#loading").show();

        return false;
    });
});
