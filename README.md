# Umi UI

**[Umi](https://github.com/umijs/umi) R&D Workbench**, integrates a series of Visual Aided Programming (VAP) plug-ins to help developers develop Umi projects faster and better.

![https://user-images.githubusercontent.com/13595509/73431180-c77ab400-437a-11ea-9baa-ebd00109b1d0.png](https://user-images.githubusercontent.com/13595509/73431180-c77ab400-437a-11ea-9baa-ebd00109b1d0.png)

**For umi@3 project**

## 🎬 Quick start

The first step is to install `@umijs/preset-ui` in the project first

```sh
$ yarn add @umijs/preset-ui -D
```

start using:

```bash
# in umi project root path
- $ umi dev
```

## ✨ Main functions

### Task

Command visual display

![https://camo.githubusercontent.com/9352fc593eb35e8cde6162b8a333d32d2a3c3197/68747470733a2f2f63646e2e6e6c61726b2e636f6d2f79757175652f302f323031392f6769662f38363032352f313537303638373036313932302d36663239623636342d346335382d343335312d383933622d6234333035333334316366352e676966](https://camo.githubusercontent.com/9352fc593eb35e8cde6162b8a333d32d2a3c3197/68747470733a2f2f63646e2e6e6c61726b2e636f6d2f79757175652f302f323031392f6769662f38363032352f313537303638373036313932302d36663239623636342d346335382d343335312d383933622d6234333035333334316366352e676966)

### Assets

Insert block in page

![https://camo.githubusercontent.com/b8218fb0de21a567f474c0bb4e4a9d8dd96257ca/68747470733a2f2f63646e2e6e6c61726b2e636f6d2f79757175652f302f323031392f6769662f38363032352f313537343134353634323731322d34656638663065302d623833352d343633382d616336382d3732336163303736393533352e676966](https://camo.githubusercontent.com/b8218fb0de21a567f474c0bb4e4a9d8dd96257ca/68747470733a2f2f63646e2e6e6c61726b2e636f6d2f79757175652f302f323031392f6769662f38363032352f313537343134353634323731322d34656638663065302d623833352d343633382d616336382d3732336163303736393533352e676966)

Specify the position where the block can be inserted in the page

```tsx
import React from 'react';
import { UmiUIFlag } from 'umi';

import { Button } from 'antd';

export default () => (
  <div>Hello
    <div>
      <p>World</p>
      <UmiUIFlag />
      <p>
        aaaaa
        <div>
          <UmiUIFlag inline />Hello Inline<UmiUIFlag inline />
        </div>
      </p>
    </div>
    <Button type="primary">World</Button>
  </div>
)
```

![https://user-images.githubusercontent.com/13595509/73427305-731f0680-4371-11ea-83de-1f19a99c32cd.png](https://user-images.githubusercontent.com/13595509/73427305-731f0680-4371-11ea-83de-1f19a99c32cd.png)

### Open assets from the page

![gif](https://user-images.githubusercontent.com/13595509/76141271-8ffbd780-609d-11ea-8a28-e9ac6c77552d.gif)

```js
window.postMessage(
  JSON.stringify({
    action: 'umi.ui.block.addTemplate',
    // Only 4 parameters are required
    payload: {
      name:'Analysis page',
      key: "DashboardAnalysis",
      url: "https://github.com/ant-design/pro-blocks/tree/master/DashboardAnalysis",
      path: "DashboardAnalysis",
    }
  }),
  '*'
)
```

### Small bubble message prompt

![aaa](https://user-images.githubusercontent.com/13595509/86702323-6cde3600-c045-11ea-8293-0e62956b0410.gif)

If the UI plug-in wants to call the small bubble, it can use the following API:

```js
// 小气泡开启 loading
window.parent.postMessage(
  JSON.stringify({
    action: 'umi.ui.toggleIconLoading',
  }),
  '*',
);

// Modify the text displayed in the small bubble
window.parent.postMessage(
  JSON.stringify({
    action:'umi.ui.changeEdit',
    payload: {
      'zh-CN':'OneAPI updated',
      'en-US': 'OneAPI Updated',
    },
  }),
  '*',
);
```

[More features](https://github.com/sorrycc/blog/issues?utf8=%E2%9C%93&q=is%3Aissue+is%3Aopen+Umi+UI+in%3Atitle+)

## 📖 API

API is composed of [Umi Plugin Basic API](https://umijs.org/plugin/umi-ui.html#%E6%9C%8D%E5%8A%A1%E7%AB%AF%E6%8E%A5%E5%8F%A3) + [Client API](https://umijs.org/plugin/umi-ui.html#ClientInterface).

## 😊 How to contribute?

`master` is used for ʻumi@3`.

### Directory Structure

```bash
.
├── README.md
├── examples
│ └── app # dev The project tested during development
├── lerna.json
├── package.json
├── packages
│ ├── preset-ui # ui plugin set, including the following plugins
│ │ ├── package.json
│ │ └── src
│ │ ├── bubble # mini version of small bubbles
│ │ ├── index.ts # integrated blocks, tasks, ./plugins/*
│ │ └── plugins
│ │ ├── configuration # Configuration UI plugin
│ │ ├── dashboard # Dashboard panel plugin
│ │ └── routes # TODO: Route
│ │
│ ├── block-sdk # Block SDK, used for plugin-blocks and plugin-ui-blocks
│ │ ├── package.json
│ │ ├── .fatherrc.ts # father-build build cjs
│ │ └── src # sdk main body
│ │
│ ├── plugin-ui-blocks # Asset UI plugin
│ │ ├── dist # index.umd.js built by the ui directory
│ │ ├── package.json
│ │ ├── .fatherrc.ts # father-build builds umd and cjs
│ │ ├── src # server logic
│ │ └── ui # Client UI part
│ ├── plugin-ui-tasks
│ │ ├── package.json
│ │ ├── src
│ │ └── ui
│ ├── theme # Umi UI theme package, later replaced with antd@4 dark theme package
│ │ ├── dark.less
│ │ ├── light.less
│ │ └── package.json
│ ├── types # Umi UI type, integrated in @umijs/types, it is recommended to import community plugins from @umijs/types
│ └── ui # Umi UI server
│ ├── client # Umi UI main body
│ │ └── src
│ │ └── PluginAPI.ts # Provide plug-in client API
│ ├── package.json
│ └── src # Umi UI Server
├── scripts
│ ├── dev.ts
│ ├── publish.js
│ ├── syncTNPM.js # Sync tnpm
│ ├── ui.js # ui build script, use umi to build the main Umi UI framework
│ └── uiPlugins.js
└── test # TODO: More scenarios test cases
  └── ui.e2e.ts # e2e test case
```

### Ready to work

After clone the warehouse, perform the installation and link work of the corresponding package.

```bash
$ yarn
```

### Development and debugging

Execute the build, and bring `-w` for real-time modification and compilation:

```bash
# Single terminal
$ yarn build -w
```

Perform UI construction, and also bring `-w`:

```bash
# Start another terminal
$ yarn ui:build -w
```

Enter the `cd example/app` test project:

```bash
# Third terminal
# Warehouse debugging brought BABEL_CACHE=none DEBUG=umiui*

$ yarn start
🚀 Starting Umi UI using umi@3.0.1...
🌈 Umi UI mini Ready on port 3000
```

Visit [http://localhost:3000](http://localhost:3000) to be Umi UI.

Debug as shown:

![](https://raw.githubusercontent.com/ycjcl868/cdn/master/20200202091318.png?token=ADHXG5NO7FQGSB4U5HFYBH26GYRG6)

### Plug-in development principle

UI plug-ins and ordinary Umi plug-ins are actually the same principle.

It just uses two more APIs than ordinary Umi plugins:

- ʻApi.addUIPlugin` is used to load the umd package of ui
- ʻApi.onUISocket` provides a server interface for the front-end ui

[Learn more](https://umijs.org/plugin/umi-ui.html#%E6%9C%8D%E5%8A%A1%E7%AB%AF%E6%8E%A5%E5%8F%A3)

### UI plugin organization

This warehouse includes:

- UI Server (@umijs/ui/src/UmiUI.ts, using Express)
- UI main frame (@umijs/ui/client, built with umi)
- UI plugin set (@umijs/plugin-ui)
    - Dashboard panel (./plugins/dashboard)
    - Configuration plugin (./plugins/configuration)
    - Asset plugin (@umijs/plugin-ui-blocks)
    - Task plugin (@umijs/plugin-ui-tasks)
