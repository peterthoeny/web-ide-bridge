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
  - web-dev-sync.rs           -- rust backend
  - web-dev-sync.js           -- JavaScript frontend
  - ?? (what else?)
- server:                     -- server side tier
  - README.md                 -- readme, points to README.md of repository root
  - package.json              -- package file
  - package-lock.json         -- package file
  - web-dev-sync-server.conf  -- configuration file
  - web-dev-sync-server.js    -- node.js application

I see that you specify code in developer_context.md. What percentage of code complete is that? I did not ask to do that yet.

------------------------------

------------------------------

------------------------------
