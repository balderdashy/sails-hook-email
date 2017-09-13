/**
 * Module dependencies
 */

var nodemailer = require('nodemailer');
var htmlToText = require('nodemailer-html-to-text').htmlToText;
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var async = require('async');
var _ = require('lodash');
var inlineCss = require('inline-css');

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

module.exports = function Email(sails) {

  var transport;
  var self;

  var compileTemplate = function (view, data, cb) {
    // Use Sails View Hook if available
    if (sails.hooks.views && sails.hooks.views.render) {
      var relPath = path.relative(sails.config.paths.views, view);
      sails.hooks.views.render(relPath, data, cb);
      return;
    }

    // No Sails View hook, fallback to ejs
    fs.readFile(view + '.ejs', function (err, source) {
      if (err) return cb(err);

      try {
        var compileFn = ejs.compile((source || "").toString(), {
          cache: true, filename: view
        });

        cb(null, compileFn(data));
      } catch (e) {
        return cb(e);
      }
    });
  };

  return {

    /**
     * Default configuration
     * @type {Object}
     */
    defaults: {
      __configKey__: {
        service: 'Gmail',
        auth: {
          user: 'myemailaddress@gmail.com',
          pass: 'mypassword'
        },
        templateDir: path.resolve(sails.config.appPath, 'views/emailTemplates'),
        from: 'noreply@hydra.com',
        testMode: true
      }
    },

    configure: function () {
      // Ensure we have the full path, relative to app directory
      sails.config[this.configKey].templateDir = path.resolve(sails.config.appPath, sails.config[this.configKey].templateDir);
    },


    /**
     * @param  {Function} cb
     */
    initialize: function (cb) {
      self = this;

      // Optimization for later on: precompile all the templates here and
      // build up a directory of named functions.
      //
      if (sails.config[self.configKey].testMode) {
        transport = {
          sendMail: function (options, cb) {

            // Add sent timestamp
            options.sentAt = new Date();

            // First check the .tmp directory exists
            fs.exists(path.join(sails.config.appPath, '.tmp'), function (status) {
              if (!status) {
                fs.mkdir(path.join(sails.config.appPath, '.tmp'), function (err) {
                  if (err) return cb(err);
                  fs.appendFile(path.join(sails.config.appPath, '.tmp/email.txt'), JSON.stringify(options) + "\n", cb);
                });
                return;
              }

              // Otherwise just write to the .tmp/email.txt file
              fs.appendFile(path.join(sails.config.appPath, '.tmp/email.txt'), JSON.stringify(options) + "\n", cb);
            });
          }
        };
        return cb();
      } else {

        try {
          if (sails.config[self.configKey].transporter) {
            // If custom transporter is set, use that first
            transport = nodemailer.createTransport(sails.config[self.configKey].transporter);
          } else {
            // create reusable transport method (opens pool of SMTP connections)
            var smtpPool = require('nodemailer-smtp-pool');
            transport = nodemailer.createTransport(smtpPool({
              service: sails.config[self.configKey].service,
              auth: sails.config[self.configKey].auth
            }));
          }

          // Auto generate text
          transport.use('compile', htmlToText());
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
      // Turn off layouts by default
      if (typeof data.layout === 'undefined') data.layout = false;

      var templateDir = sails.config[self.configKey].templateDir;
      var templatePath = path.join(templateDir, template);

      // Set some default options
      var defaultOptions = {
        from: sails.config[self.configKey].from
      };

      sails.log.verbose('EMAILING:', options);

      async.auto({

        // Grab the HTML version of the email template
        compileHtmlTemplate: function (next) {
          compileTemplate(templatePath + "/html", data, function (err, html) {
            if (err) next(err);
            // make CSS inline
            inlineCss(html, { url: ' ' }).then(function (inlineHtml) {
              next(null, inlineHtml);
            });
          });
        },

        // Grab the Text version of the email template
        compileTextTemplate: function (next) {
          compileTemplate(templatePath + "/text", data, function (err, html) {
            // Don't exit out if there is an error, we can generate plaintext
            // from the HTML version of the template.
            if (err) return next();
            next(null, html);
          });
        },

        // Send the email
        sendEmail: ['compileHtmlTemplate', 'compileTextTemplate', function (results, next) {

          defaultOptions.html = results.compileHtmlTemplate;
          if (results.compileTextTemplate) defaultOptions.text = results.compileTextTemplate;

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
        function (err, results) {
          if (err) return cb(err);
          cb(null, results.sendEmail);
        });
    }

  };
};
