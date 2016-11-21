config
======

Your HomeBridge/Alexa configuration goes in this directory. The final result is
based on NODE_ENV and interpreted by [confit](https://github.com/krakenjs/confit).

* config.json - configuration shared by all environments
* development.json - Overlaid onto config.json if running in development
* production.json - Overlaid onto config.json if running in production