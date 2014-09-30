/**
 * Module dependencies
 */

var nodemailer = require('nodemailer');
var fs = require('fs');
var ejs = require('ejs');
var path = require('path');


/**
 * Email Hook
 *
 * Integration with relevant parts of the nodemailer API.
 *
 * For a full list of available email options see:
 * https://github.com/andris9/Nodemailer#e-mail-message-fields
 *
 * @param  {App} sails
 * @return {Object}
 * @hook
 */

module.exports = function Email (sails) {

  var transport;
  var self = this;

  return {

    /**
     * Default configuration
     * @type {Object}
     */
    defaults: function() {
      var obj = {};
	  
	  try {
	  	 self.configKey = sails.config.hooks['sails-hook-email'].configKey
	  }
	  catch(e){
	  		self.configKey = "email";
	  }

      obj[self.configKey] = {
        service: 'Gmail',
        auth: {
          user: 'myemailaddress@gmail.com',
          pass: 'mypassword'
        },
        templateDir: path.join(__dirname, '../../views/emailTemplates'),
        from: 'noreply@login.com',
        testMode: true
      };
      return obj;
    },


    /**
     * @param  {Function} cb
     */
    initialize: function (cb) {

      // Optimization for later on: precompile all the templates here and
      // build up a directory of named functions.
      //
      if (sails.config[self.configKey].testMode) {
        transport = {
          sendMail: function(options, cb) {

            // First check the .tmp directory exists
            fs.exists(path.join(sails.config.appPath, '.tmp'), function(status) {
              if(!status) {
                fs.mkdir(path.join(sails.config.appPath, '.tmp'), function(err) {
                  if(err) return cb(err);
                  fs.appendFile(path.join(sails.config.appPath, '.tmp/email.txt'), JSON.stringify(options)+"\n", cb);
                });
                return;
              }

              // Otherwise just write to the .tmp/email.txt file
              fs.appendFile(path.join(sails.config.appPath, '.tmp/email.txt'), JSON.stringify(options)+"\n", cb);
            });
          }
        };
        return cb();
      } else {

        try {

          // create reusable transport method (opens pool of SMTP connections)
          transport = nodemailer.createTransport({
            service: sails.config[self.configKey].service,
            auth: {
              user: sails.config[self.configKey].auth.user,
              pass: sails.config[self.configKey].auth.pass
            }
          });

          return cb();
        }
        catch (e) {
          return cb(e);
        }

      }
    },


    /**
     * Send an email.
     * @param  {Sting}    template (a named template to render)
     * @param  {Object}   data (data to pass into the template)
     * @param  {Object}   options (email options including to, from, etc)
     * @param  {Function} cb
     */

    send: function (template, data, options, cb) {

      data = data || {};
      var templateDir = sails.config[self.configKey].templateDir;
      var templatePath = path.join(templateDir, template);

      // Set some default options
      var defaultOptions = {
        generateTextFromHTML: true
      };

      sails.log.verbose('EMAILING:',options);

      async.auto({

        // Grab the HTML version of the email template
        readHtmlTemplate: function(next) {
          fs.readFile(templatePath + '/html.ejs', next);
        },

        // Grab the Text version of the email template
        readTextTemplate: function(next) {
          fs.readFile(templatePath + '/text.ejs', function(err, template) {
            // Don't exit out if there is an error, we can generate plaintext
            // from the HTML version of the template.
            if(err) return next();
            return next(null, template);
          });
        },

        // Compile the templates using ejs
        compileTemplates: ['readHtmlTemplate', 'readTextTemplate', function(next, results) {
          var html;
          var text;

          // Compile the HTML template, error out if there is an issue compiling
          try {
            if(results.readHtmlTemplate) {
              var htmlFn = ejs.compile(results.readHtmlTemplate.toString(), {
                cache: true, filename: template + 'html'
              });

              html = htmlFn(data);
            }
          } catch(e) {
            return next(e);
          }

          // Attempt to compile and render the text version of the template, if there is
          // an error don't return the error because the HTML version can be used to generate
          // a plain text version
          try {
            if(results.readTextTemplate) {
              var textFn = ejs.compile(results.readTextTemplate, {
                cache: true, filename: template + 'text'
              });

              html = textFn(data);
            }
          } catch(e) {}


          return next(null, { html: html, text: text });
        }],


        // Send the email
        sendEmail: ['compileTemplates', function(next, results) {

          defaultOptions.html = results.compileTemplates.html;
          if(results.compileTemplates.text) defaultOptions.text = results.compileTemplates.text;

          // `options`, e.g.
          // {
          //   to: 'somebody@example.com',
          //   from: 'other@example.com',
          //   subject: 'Hello World'
          // }
          var mailOptions = _.defaults(options, defaultOptions);
          mailOptions.to = sails.config[self.configKey].alwaysSendTo || mailOptions.to;

          transport.sendMail(mailOptions, next);
        }]

      },

      // ASYNC callback
      function(err, results) {
        if(err) return cb(err);
        cb(null, results.sendEmail);
      });
    }

  };
};
