# sails-hook-email

Email hook for [Sails JS](http://sailsjs.org), using [Nodemailer](https://github.com/andris9/Nodemailer/blob/0.7/README.md)

### Installation

`npm install sails-hook-email`

### Usage

`sails.hooks.email.send(template, data, options, cb)`

Parameter      | Type                | Details
-------------- | ------------------- |:---------------------------------
template       | ((string))          | Relative path from `templateDir` (see "Configuration" below) to a folder containing email templates.
data           | ((object))          | Data to use to replace template tokens
options        | ((object))          | Email sending options (see [Nodemailer docs](https://github.com/andris9/Nodemailer/blob/0.7/README.md#e-mail-message-fields))
cb             | ((function))        | Callback to be run after the email sends (or if an error occurs).

### Configuration
Create the Hook

Create the following folder and file underneath your project `api/hooks/email/index.js`
Below are the contents you should save in the index.js file
`module.exports = require('sails-hook-email');`

By default, configuration lives in `sails.config.email`.  The configuration key (`email`) can be changed by setting `sails.config.hooks['sails-hook-email'].configKey`.

Parameter      | Type                | Details
-------------- | ------------------- |:---------------------------------
service        | ((string)) | A "well-known service" that Nodemailer knows how to communicate with (see [this list of services](https://github.com/andris9/Nodemailer/blob/0.7/README.md#well-known-services-for-smtp))
auth | ((object)) | Authentication object as `{user:"...", pass:"..."}`
templateDir | ((string)) | Path to view templates (defaults to `../../views/emailTemplates`)
from | ((string)) | Default `from` email address
testMode | ((boolean)) | Flag indicating whether the hook is in "test mode".  In test mode, email options and contents are written to a `.tmp/email.txt` file instead of being actually sent.  Defaults to `true`.
alwaysSendTo | ((string)) | If set, all emails will be sent to this address regardless of the `to` option specified.  Good for testing live emails without worrying about accidentally spamming people.

### Templates

To define a new email template, create a new folder with the template name inside your `templateDir` directory, and add an **html.ejs** file inside the folder.  You may also add an optional `text.ejs` file; if none is provided, Nodemailer will attempt to create a text version of the email based on the html version.

### Example

Given the following **html.ejs** file contained in the folder **views/emailTemplates/testEmail**:

```
<p>Dear <%=recipientName%>,</p>
<br/>
<p><em>Thank you</em> for being a friend.</p>
<p>Love,<br/><%=senderName%></p>
```

executing the command with default configuration:

```
sails.config.hooks.email(
  "testEmail",
  {
    recipientName: "Joe",
    senderName: "Sue"
  },
  {
    to: "joe@example.com",
    subject: "Hi there"
  },
  function(err) {console.log(err || "It worked!");}
)
```

will result in the following email being sent to `joe@example.com`

> Dear Joe,
>
> *Thank you* for being a friend.
>
> Love,
>
> Sue

with an error being printed to the console if one occurred, otherwise "It worked!".
