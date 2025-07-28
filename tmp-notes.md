Prompts for Claude Sonnet 4 AI
------------------------------

Attached is the description of an existing application I wrote using AI that I intend to recreate clean of IP.

Before I ask you to create a README.md and a developer_context.md for that spec, let me know if there is another way around the JavaScript sandbox in the browser that avoids server side code. Is there a way to launch an IDE directly when a user presses the [External Editor] button below a textarea? Assume that the web app has an Edit button, which opens a dialog box/goes to a different screen that may have several textareas of different types (txt, html, js, css, py).

------------------------------

The WebDevSync tool is tailored for web applicatons that allows users to edit code snippets in textarea elements. Programmers miss the rich feature set of desktop IDEs in browser based apps, such as syntax highlighting, code completion, indent change, and more. WebDevSync allows users to lauch their favorite IDE right from the web application. After saving the local file in the IDE, the changes are automatically synchronized back to the textarea of the web application.

Because JavaScript runs in the browser's sandbox, it has no access to the local OS to launch an IDE directly. WebDevSync solves that by using an intermediary on the server where the web app resides.

WebDevSync consists of three parts:
- web-dev-sync JavaScript library:
  - runs in the browser
  - used by the web app to synchronize code snippets between textarea and IDE
  - the web app shows an [External Editor] button next to each textarea
- web-dev-sync-server:
  - node.js application that resides on the same server where the web application resides
  - it manages data sync between browser an desktop app using WebSockets
  - it manages edit sessions, so that updated code snippets can be routed to the proper user and textarea
- WebDevSync desktop application:
  - built for Windows and macOS
  - receives code snippet edit requests from web-dev-sync-server
  - launches IDE with code snippet
  - monitors save events of IDE, and sends updated code snippet back to web-dev-sync-server

System start and edit roundtrip example:
- on server:
  - the web-dev-sync-server acts as a WebSocket server
  - it waits for client connections from web-dev-sync JavaScript library in the browser, and
  - it waits for client connections from the WebDevSync desktop application
  - it keeps track of open connections
  - it keeps track of user sessions, so that code snippets can be routed to the right desktop
- on browser:
  - a web developer integrates the web-dev-sync JavaScript library into her web application (one time)
  - when the user initiates the edit mode in the web application:
    - the web-dev-sync JavaScript library opens a WebSocket connection to web-dev-sync-server
    - it waits for [External Editor] button clicks
- on desktop:
  - the user launches the WebDevSync desktop application
  - the user configures the websocket connection and preferred IDE on first startup, which is remembered persistently
  - the app opens a WebSocket connection to web-dev-sync-server
  - it waits for edit code snippet requests from the server
  - the user keeps the app running in the background
- on browser:
  - user hits [External Editor] button next to a textarea
  - the code snippets is sent to web-dev-sync-server via open WebSocket connection, alongside with an ID identifying the texarea, and file extension (such as .js, .css, .html)
- on server:
  - web-dev-sync-server receives the code snippet from the browser
  - it identifies the right WebDevSync desktop application via user session
  - it sends the code snippet to the desktop application via open WebSocket connection
- on desktop:
  - the WebDevSync desktop application receives the code snippet
  - it saves the code snippet to a temporary file using the specified file extension
  - it launches the user's preferred IDE with the temporary file
  - it monitors file timestamp changes of the temporary file
  - user makes changes to the code snippet in IDE, and hits save
  - WebDevSync detects the file save, and sends the updated code snippet to the server via open WebSocket connection
- on server:
  - web-dev-sync-server receives the updated code snippet from the desktop via open WebSocket connection
  - it sends the updated code snippet with ID to the browser via open WebSocket connection
- on browser:
  - web-dev-sync receives the updated code snippet from the server via open WebSocket connection
  - it replaces the textarea content with the updated code snippet

Notes:

- multiple edits:
  - a user can hit the [External Editor] below a textarea several times; each time the code snippet is sent to the IDE
  - a user can hit Save in the IDE several times; each time the updated code snippet is sent to the browser, and the textarea content is replaced (with error condition if the web app is not in edit mode)

- status indication:
  - each textarea has a visual indication if the bridge to the IDE is active, such as a faint yellow backgrond instead of white
  - the WebDevSync desktop application has a status indication, green when the browser to IDE brige is active

- web-dev-sync-server:
  - acts as a WebSocket server
  - app configuration:
    - port number
    - WebSocket endpoint
    - WebSocket hearbeat interval
    - CORS config with origin array, credentials
    - session with secret, cookie, resave, saveUninitialized
    - debug flag
  - status page showing:
    - active or not
    - statistics for active browser connections, desktop connections, active edit sessions, users
  - debug page showing in JSON format:
    - active browser connections, desktop connections, active edit sessions, users

- web-dev-sync JavaScript library:
  - acts as a WebSocket client
    - generates its own connection ID using a local uuidv4() function
  - WebDevSync class with:
    - constructor(userID, debug = false)
    - connect() -- to connect
    - disconnect() -- to disconnect
    - isConnected() -- returns connected status
    - statusChange(callback) -- register a callback for connection status
    - onCodeUpdate(callback) -- register a callback for when updated code snippet arrives from IDE
    - async editCodeSnippet(id, codeSnippet, editType = 'txt') -- send code snippet to IDE

- WebDevSync desktop app:
  - acts as a WebSocket client
    - generates its own connection ID using a local uuidv4() function
  - app configuration:
    - WebSocket endpoint
    - debug flag
  - user configuration:
    - preferred IDE, default is platform specific: 
    - user ID, default is user ID of OS (needed by web-dev-sync-server to route code snippets to proper desktop)
    - websocket URL

------------------------------

Enhance README.md:
- Architecture diagram:
  - has one char too many in both arrows
- Quick Start:
  - start with:
    - Prerequisites:
      - Node.js (v14+ recommended)
      - npm
      - Electron (for desktop application)
  - 3. Integrate into Web Application
    - change URI to "/path/to/web-dev-sync/web-dev-sync.min.js"
- Configuration:
  - Server Configuration:
    - add note:
      - Cody `web-dev-sync-server.conf` to `/etc`, and change options as needed
    - change websocketEndpoint to '/web-dev-sync/ws'
    - add section how to run using npm, and to use process manager in production, such as pm2
    - add note on reverse nginx proxy:
      - purpose: the web-dev-sync-server is accessible under same port and URI as the web app
      - add note that the websocket endpoint may change from ws to wss
      - add note that on a load-balanced server deployment to send ws traffic to a single app server where the web-dev-sync-server is running
      - add example nginx conf for:
        - status & debug endpoints below location /web-dev-sync
        - ws endpoint below location /web-dev-sync/ws
    - add docker section:
      - explain how to run web-dev-sync-server in a docker image
      - add example ports section in .yaml file

- Desktop App Configuration
  - Security Considerations
    - because edit session end is ambiguous and need to be longish, change second bullet to something like:
      - Files are cleaned up periodically based on age
- License:
  - change license to GPL v3

- add build instructions for WebDevSync desktop app
  - separate instructions for macOS and Windows
  - assume Electron (however: is there a better solution for macOS and Windows that is less resource intensive than Electron? if so propose and document that)

Enhance developer_context.md:
- enhance based on updated README.md

------------------------------

* remove reference to Electron, and only use Tauri
* make docker an option, .e.g. "in case you use docker..."
* let's start simple, use single node instance for web-dev-sync-server, no redis
* document default port 8071 instead of 8080
* make a distinction of URIs the users sees on the web server (such as /web-dev-sync/ws, /web-dev-sync/status) and the web-dev-sync-server app (such as /ws, /status) -- sorry, so the original was likely correct: `  websocketEndpoint: '/ws',`
* desktop config: document the default ws endpoint as `ws://localhost:8071/ws` for dev deployment, and `wss://webapp.example.com/web-dev-sync/ws` for production deployment with reverse proxy
* same for monitoring => status and debug, such as `http://localhost:8080/status` for dev, and `https://webapp.example.com/web-dev-sync/status` for prod

------------------------------

README.md:
- sorry, in hindsight, it's probably less confusing if the endpoints in in front and back of reverse proxy are the same, e.g.
  - `websocketEndpoint: '/web-dev-sync/ws'`
  -  `/web-dev-sync/ws`, `/web-dev-sync/status` , `/web-dev-sync/debug` for cosistency
  - `location /web-dev-sync/` has: `proxy_pass http://localhost:8071/web-dev-sync/;`
  - same fix for `location /web-dev-sync/ws`
  - `http://localhost:8071/status` becomes `http://localhost:8071/web-dev-sync/status`
  - same fix for `http://localhost:8071/debug`
- cors origin, which should list `https://webapp.example.com` for consistency.

developer_context.md:
- remove reference to Electron
- match README.md, such as port number 8071 instead of 8080, and `webapp.example.com` instead of `yourapp.com`
- docker should also reference port 8071 instead of 8080
- in nginx for prod, proxy_pass is listed twice, keep only http://webdevsync-backend
- in `upstream webdevsync-backend` should reference `localhost:8071` for dev, and a single app server for prod, such as http://app-123.us-west.example.com:8071/web-dev-sync/ws;

------------------------------

almost there.

developer_context.md:
* Docker deployment still references port 8080
* Nginx Configuration for Production still references port 8080

------------------------------

could you list the complete developer_context.md file? v29 only starts with '**Server Deployment**'

------------------------------

oops, something is not right, v30 ends with:
```handleIDENotFound() { *// Show user-friendly error and configuration dialog* this.app.showErrorDialog({```

------------------------------

Add a directory and file list to README.md:

- README.md                   -- readme, getting started
- LICENSE                     -- license file
- developer_context.md        -- developer context
- browser:                    -- browser side tier
  - demo.html                 -- demo page with two textarea forms
  - web-dev-sync.js           -- implements WebDevSync
- desktop:                    -- desktop tier (Windows, macOS)
  - README.md                 -- readme, points to README.md of repository root
  - web-dev-sync.conf         -- configuration file
  - web-dev-sync.rs           -- rust backend
  - web-dev-sync.js           -- JavaScript frontend
  - ?? (what else?)
- server:                     -- server side tier
  - README.md                 -- readme, points to README.md of repository root
  - package.json              -- package file
  - package-lock.json         -- package file
  - web-dev-sync-server.conf  -- configuration file
  - web-dev-sync-server.js    -- node.js application

Any other files missing? List as needed.

I see that you specify code in developer_context.md. What percentage of code complete is that? I did not ask to do that yet.

------------------------------

Add the `.gitignore`

I am pondering alternative names to WedDevSync, looking for a descriptive and memorable name:
- WedDevSync
- SyncWeb2IDE
- BridgeWeb2IDE
- BridgeWebToIDE
- WebToIDEBridge
- WebToIdeBridge
- Web IDE Bridge
- Web-IDE Bridge
- Web-IDE-Bridge

Also I am wondering if there is a better label for the "External Editor" button?
- "External Editor"
- "Edit in IDE"

------------------------------

Agreed, change:
- project name to `Web-IDE-Bridge`
- button to `Edit in IDE ↗`

Rename all references in README.md and dev context accordingly.

Using Cursor, how do I rename a repository? Or, better done in the github GUI?

------------------------------

Using Cursor, how do I rename a repository? Or, better done in the github GUI?

README.md:
- change title to: `# Web-IDE-Bridge v0.1.3 (work in progress)`
- remove `### .gitignore` file section (but keep in Project Structure)
- in `## Quick Start`, change multiple installs to a single `npm install -g web-ide-bridge` that pulls the whole project structure
- there are 9 references left of `web-dev-sync` and `webdevsync`

developer_context.md:
- something is messed up, it does not start with the heading
- set heading to `# Web-IDE-Bridge Developer Context v0.1.3 (work in progress)
- there are 26 references left of `web-dev-sync` and `webdevsync`

------------------------------

still something messed up with den context doc: `# WebDevSync status and debug endpoints` is shown on top

------------------------------

please fix the dev context doc, it still starts with `# Web-IDE-Bridge status and debug endpoints`

------------------------------

still something off. the dev context doc ends with `### Error Recovery Strategies`, and the `### Load Balancing and High Availability` section and content after that is missing

------------------------------

the doc still stops at `Error Recovery Strategies`

------------------------------

now fix README.md, it still has 12 references of  `web-dev-sync` and `webdevsync`

------------------------------

Next step: implement the Web-IDE-Bridge in phases. Consider yourself an experienced full stack coder developer with 10+ years of experience.

First task: Based on README and developer context, implement the server tier. let me know the content of the 4 files in server/ directory.

------------------------------

my username is `peterthoeny`

------------------------------

change README to have just the title, one sentence what it is, and `See [../README.md](../README.md)`

update the server section in the project README as needed (for example, there is only one git pull)

------------------------------

web-ide-bridge-server.js is not complete, it stops at checkRateLimit()​

------------------------------

before we go to browser tier, recommend unit test structure, and generate unit test files for server/. update also the project README accordingly.

------------------------------

what is better, have all tests in the tests/ directory with tests/server/, or as you listed server/tests/ ?

------------------------------

I am not clear now on the new files, please elaborate with file content

------------------------------

is project README updated for running the tests?

------------------------------

before we go to the next tier, review one more time the server code, and test coverage. modify as needed

------------------------------

(NOTE: start new chat)

Web-IDE-Bridge implementation

------------------------------

(followed by pasting each file, path and content; one by one)

------------------------------

review the server/ code and the existing test infra. improve as needed. for example, tests/server/edge-cases.test.js is incomplete.

consider yourself an experienced full stack coder developer with 10+ years of experience.

------------------------------

(after some debug sessions to get server running)

now the server starts properly.

- add `/web-ide-bridge/status` and `/web-ide-bridge/debug` URIs to `.conf` file
- change `/web-ide-bridge/status` to a simple HTML page with simple style in generated HTML, e.g. no JSON output
- redirect `/` to `/web-ide-bridge/status` (or serve at `/`?)

------------------------------

review project README and enhance as needed. for example, tests/ in Project Structure is incomplete.

also, default debug flag in server/web-ide-bridge-server.conf should be true.

------------------------------

```$ npm install
$ npm run test:server

> web-ide-bridge@0.1.3 test:server
> jest tests/server

(node:12462) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 uncaughtException listeners added to [process]. Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)

  ●  Cannot log after tests are done. Did you forget to wait for something async in your test?
    Attempted to log "Web-IDE-Bridge server v0.1.3 running on localhost:0".

      356 |     }
      357 |   }
    > 358 |
          | ^
      359 |   /**
      360 |    * Set up Express application with middleware
      361 |    */

      at console.log (node_modules/@jest/console/build/BufferedConsole.js:156:10)
      at Server.<anonymous> (server/web-ide-bridge-server.js:358:17)```

------------------------------

going forward, provide the file name for each updated file.

(followed by a number of debug sessions to fix tests)

------------------------------

I'll paste some code, just listen until further instructed

------------------------------

next task: looking at project README and developer context files, implement `browser/`. for `demo.html` use a matching style to server status page. (one I give the go ahead)

------------------------------

in server log I see this when pushing "Connect to Server" button:
```
127.0.0.1 - - [22/Jul/2025:19:47:49 +0000] "GET /web-ide-bridge/status HTTP/1.1" 200 - "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0"
New WebSocket connection: e6d5ab59-14b5-47d9-95b0-478015739d13 from 127.0.0.1
Error: Invalid connectionId: does not match connection (connection: e6d5ab59-14b5-47d9-95b0-478015739d13)
127.0.0.1 - - [22/Jul/2025:19:48:20 +0000] "GET /web-ide-bridge/status HTTP/1.1" 200 - "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0"
Error: Invalid connectionId: does not match connection (connection: e6d5ab59-14b5-47d9-95b0-478015739d13)
```

------------------------------

now I get this on the server:
```New WebSocket connection: fb99e773-ff05-44f7-97bc-2c8b382301f4 from 127.0.0.1
127.0.0.1 - - [22/Jul/2025:19:55:32 +0000] "GET /web-ide-bridge/status HTTP/1.1" 200 - "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0"
Error: Invalid connectionId: does not match connection (connection: fb99e773-ff05-44f7-97bc-2c8b382301f4)
```
and this in the browser demo log:
```
Ready to connect to Web-IDE-Bridge server...
[12:55:08 PM] Demo page loaded. Ready to connect!
[12:55:13 PM] Attempting to connect to server...
[12:55:13 PM] Using user ID: demo-user-mimls0h09
[12:55:13 PM] Connection status changed: disconnected
[12:55:13 PM] Connection status changed: connecting
[12:55:13 PM] Connection status changed: connected
[12:55:13 PM] Successfully connected to Web-IDE-Bridge server!
[12:55:13 PM] Error: Failed to parse server message
[12:55:44 PM] Error: Invalid connectionId: does not match connection
[12:56:14 PM] Error: Invalid connectionId: does not match connection```

------------------------------

server log now ok. browser demo log:
```
Ready to connect to Web-IDE-Bridge server...
[1:06:22 PM] Demo page loaded. Ready to connect!
[1:06:37 PM] Attempting to connect to server...
[1:06:37 PM] Using user ID: demo-user-tqbt6tqwa
[1:06:37 PM] Connection status changed: disconnected
[1:06:37 PM] Connection status changed: connecting
[1:06:37 PM] Connection status changed: connected
[1:06:37 PM] Successfully connected to Web-IDE-Bridge server!
[1:06:37 PM] Error: Failed to parse server message: this._handleConnectionInit is not a function
```

------------------------------

now it connects properly.

next task: change the demo as follows:
- remove "Connect to Server" button
- HTML page shows:
  - getting started section (as is)
  - new config section that defines three input fields for:
    ```const conf = {
      wsUrl: 'ws://localhost:8071/web-ide-bridge/ws',
      user: 'peter',
      reconnectTime: 10000
    };```
  - "Open Edit Demo ⬇" button, when clicked:
    - button changes to "Close Edit Demo ⬆", when clicked:
      - hide edit section
      - close the server connection
    - connect to server
      - uuid should persists until page reload (e.g. use same uuid when opening the edit demo again)
      - try to reconnect on disconnect or connection error
    - show edit section below "Open/Close Edit Demo" button (to simulate dialog box) showing:
      - only two textedit fields, with hard coded type:
        - JavaScript Code
        - HTML Template
  - status section showing:
    - browser to server connection
    - server to dektop connection (for current user)
    - (anything else?)
  - activity log section (as is)

------------------------------

Looks good, but move status section and activity log section to below the edit demo section, so that they are always visible.

Also, add a colored header for the Edit Demo section.

------------------------------

- 1. the uuid changes between open/close edit demo. make it persist until page is reloaded.
- 2. the padding below the edit demo section is missing when open.
```
New WebSocket connection: f6093b7b-e106-40f4-a1d8-fdf87ad2f9de from 127.0.0.1
Routing message: browser_connect from f6093b7b-e106-40f4-a1d8-fdf87ad2f9de
Browser connected: userId=demo-user-oba1e2j4g, connectionId=f6093b7b-e106-40f4-a1d8-fdf87ad2f9de
WebSocket disconnected: f6093b7b-e106-40f4-a1d8-fdf87ad2f9de, code=1000, reason=Client disconnect
New WebSocket connection: ba9d9175-157d-43b4-98dd-318bc26fb702 from 127.0.0.1
Routing message: browser_connect from ba9d9175-157d-43b4-98dd-318bc26fb702
Browser connected: userId=demo-user-oba1e2j4g, connectionId=ba9d9175-157d-43b4-98dd-318bc26fb702```


------------------------------

(new Claude chat)

I have a need for a relatively simple GUI app that needs to run on Windows and macOS:
- communicate with a server over websocket
- launch a program (IDE) with data received from server
- watch for file changes (update of temp file), and send data back to server
- configuration screen for user with: websocket URL, user ID, program seletion (IDE)
- save confguration persistently

I have tried Electron, it is way to heavy, slow to start, shows multiple icons in taskbar. I have tried Rust/Tauri, it is way too buggy (lost a day trying to get it to build, so that frontent can communicate with backend). I am ok with platform specific solutions if needed because I can use AI to do the coding. I am looking for a solution that is not bloated, stable, and does not take too much time from me to create. What do you recommend?

------------------------------

(new Cursor chat)

A hard reset on the desktop app implementation based on Tauri, giving up after wasting a day. Let's try the Go + Fyne way.
- familiarize yoursef with README.md and developer_context.md, but ignore any Rust/Tauri specific text
- if needed, reference the now obsolete desktop.save1/ directory
- add boilerplate files in the empty desktop/ directory
- start with a hello world prgogram, so that I can veiry the build

------------------------------

Next task: implement the UI
- Header: Web-IDE-Bridge Desktop
- small intro blurb section
- connection status section
  - desktop <=> server, server <=> browser
  - [Reconnect] button
- configuration section, showing:
  - User ID
  - WebSocket URL
  - Connection ID
  - IDE Command
  - [Change] button to edit the settings
- activity log section

For reference, the previous unusable Tauri GUI is attached

------------------------------

- make sections look like sections, e.g. section title inside that box, ideally with rounded corners
  - activity log is good
  - connecion status title should be inside the section box
  - same for configuration
- connection status section, with three boxes next to each other, e.g.:
  - Desktop ↔ Server
    (green dot) Connected
  - server ↔ Browser
    (red dot) Disconnected
  - [Reconnect] button
- configuraton section, table format, e.g.
  | User ID:       | peter                 |
  | WebSocket URL: | wss://foo.example.com |
  | IDE Command:   | TextEdit              |
  | Connection ID: | 2341234123-12341243-2 |
  [Edit Configuration]

------------------------------

let's have a conistent look
- add "v0.1.3" version number in small font next to "Web-IDE-Bridge Desktop" header
- connection status section:
  - two boxes next to each other
    - smaller font for Desktop <=> Server
    - no color in <=> symbol
    - add colored dot next to Connected/Disconnected (color & text will change based on status)
  - [Reconnect] button below (like configuration section)
- configuration section:
  - left align values (second column)
- activity log section:
  - remove redunant "activity log" text
- possible to have a gray background for section headers? with gray gradient?

------------------------------

good enouth for now, but small tweak:
- table column is still left justified
- remove background color from version string
- remove padding in sections so that header is flush with box lines (in case possible)

next: work on backend logic:
- configuration:
  - initialize with platform dependent defaults on first launch
    - user: os login name
    - websocket: dev default, prod default
    - IDE: TextEdit for mac, notepad.exe for Win
    - connection ID: generate uuid
  - save persistently
- websocket client logic (take browser/web-ide-bridge.js)
  - ping/pong
  - connect at start, automatic reconnect every 10 sec if down
- receive message to edit code snippet:
  - save temp file
  - launch IDE
  - watch for file changes on temp file
    - read temp file
    - send to server

------------------------------

UI fixes:
- make app window a bit wider
- connection status: show border round the two embedded boxes (or add diver in between to make it obvious)
- configuration: Make left column narrower so that WebSocket URL has just enough space
- actifity log: Remove empty line at end, e.g. use full space
- edit config:
  - make dialog box as wide as app window, minus a ~20px margin
  - Make left column narrower so that WebSocket URL has just enough space
  - use full remaining wiidth for edit fields
  - too large padding between IDE field and [Browse], use only 5ish px
  - remove connection id from form

------------------------------

not yet fixed:
- configuration: Make left column narrower so that WebSocket URL has just enough space
- edit config:
  - Make left column narrower so that WebSocket URL has just enough space
  - too large padding between IDE field and [Browse], use only 5ish px (now it has an even larger gap)

------------------------------

next enhance status messaging and display:

the dektop app should show the Server <=> Browser status, and the web app should be made aware also of the Desktop <=> Server status.

browser/web-ide-bridge.js
- keep .isConnected() as is, it checks only for Browser <=> Server status
- change .onStatusChange() to return { serverConnected: Boolen, desktopConnected: Boolean }
- change message to/from server to make both sides aware of Server <=> Browser and Desktop <=> Server status

browser/demo.html
- enhance connection status to show also Server <=> Desktop status

server/web-ide-bridge-server.js
- change message to/from browser to make both sides aware of Server <=> Browser and Desktop <=> Server status
- change message to/from desktop to make both sides aware of Server <=> Browser and Desktop <=> Server status

desktop/web-ide-bridge.go
- change message to/from desktop to make both sides aware of Server <=> Browser and Desktop <=> Server status
- enhance connection status to show also Server <=> Browser status


------------------------------

next: enhance message handling

browser/web-ide-bridge.js:
- make injectButton feature optional with a constructor option `addButtons: true/false`, default `true` (some web apps want to control their own button bosition & style)
- onCodeUpdate: in callback(snippetId, code) return message from integrated web app, which could be:
    - Code updated in web editor field ${snipped}
    - Error: Can't update code, editor is not in edit mode
    - Error: Can't update code, unrecognized snippet ID ${snipped}
- send info message back to server

browser/demo.html:
- use `addButtons: true` constructor option (default)

server/web-ide-bridge-server.js:
- route info message to desktop

desktop/web-ide-bridge.go
- handle info message from server
- show info message in activity log (or more prominently somewhere else?)

------------------------------

small change in version management. the central version.js is not convenient because in vertain deployments the server/, browser/, desktop/ dirs will be in different locations and/or machines.

- move version.js to server/ and browser
- fix bump-version.js accordingly
- fix README, developers_context if needed
- fix tests if needed

------------------------------

review and fix developer_context.md, payload is gone.

also, I did a ./build.sh, and open bin/darwin_amd64/Web-IDE-Bridge.app/

the app starts, I can send snippets to the ide, but save abck does not work

Ah, I see the issue:
- I opened up both demo and jquery demo
- both work for roundtrip
- I closed demo
- i send snippet from opem jquery-demo, it opens up in ide
- fails to save back, desptop sees Server<=>Browser disconnected, which is true for demo, but not fr jquery demo

we need to rethink this scenario.
- desktop sends updated snippets back to server, regardless of reported Server<=>Browser status, the server will do the right thing (reject or forward)
- question how to send Server<=>Browser status to desktop for a user, a user can have several Server<=>Browser connections.
- possibly this? the server sends Server<=>Browser connected status to desktop when 1+ user specific Server<=>Browser connections are open, and disconnected when no Server<=>Browser are open

------------------------------

make the activity log messages (and with thus debug log messages) more user focused, less implementer focused.

example in desktop:
- "Received edit_request"
   ==> "Received edit request for code snippet ${snippetId}, type ${fileType}, ${codeLength} chars"
- "[handleEditRequest] userId=peter, snippetId=javascript-123, fileType=txt, codeLength=401"
   ==> don't show to user, but keep in log
- "Saving code to temp file: /var/folders/mx/7m7y8_155nxfqz2w4hg3kqlm0000gn/T/web-javascript-123.txt" and "Launching IDE: Cursor"
   ==> combine into a single "Saving code snippet ${snippetId} to temp file, and launching IDE ${ide}"
- "File changed, sending update to server", "[sendCodeUpdate] userId=peter, snippetId=javascript-123, fileType=txt, codeLength=401"
  ==> combine into a single "Detected temp file save, sending code ${snippetId}, type ${fileType}, ${codeLength} chars to server"
- "Sent code_update to server"
  ==> Sent code ${snippetId} to server"
- fix error cases and other messages in a similar way

------------------------------

