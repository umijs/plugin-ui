import { existsSync, readdirSync, lstatSync, statSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, parse } from 'path';
import crequire from 'crequire';
import upperCamelCase from 'uppercamelcase';
import inquirer from 'inquirer';
import { IApi } from '@umijs/types';
import memFs from 'mem-fs';
import editor from '@umijs/mem-fs-editor';
import { winPath, mkdirp, semver, Mustache, rimraf, createDebug, Generator } from '@umijs/utils';
import replaceContent from './replaceContent';
import { SINGULAR_SENSLTIVE } from './constants';
import { routeExists, findJS } from './util';

const debug = createDebug('umiui:UmiUI:block-sdk:getBlockGenerator');

/**
 * 判断一个路径是否为空
 * 只要有一个文件就算非空
 * @param {*} path
 */
export const isEmptyFolder = path => {
  let isEmpty = true;

  if (!existsSync(path)) {
    return true;
  }
  if (lstatSync(path).isFile()) {
    return false;
  }

  const files = readdirSync(path);
  files.forEach(file => {
    if (!isEmpty) {
      return;
    }
    const stat = lstatSync(join(path, file));
    if (stat.isFile()) {
      isEmpty = false;
      return;
    }
    if (stat.isDirectory()) {
      isEmpty = isEmptyFolder(join(path, file));
    }
  });
  return isEmpty;
};

export function getNameFromPkg(pkg) {
  if (!pkg.name) {
    return null;
  }
  return parse(pkg.name).base;
}

/**
 * 检查两个依赖之间的冲突
 * @param {*} blockDeps
 * @param {*} projectDeps
 */
function checkConflict(blockDeps, projectDeps) {
  const lacks = [];
  const conflicts = [];
  Object.keys(blockDeps).forEach(dep => {
    if (!projectDeps[dep]) {
      lacks.push([dep, blockDeps[dep]]);
    } else if (!semver.intersects(projectDeps[dep], blockDeps[dep], true)) {
      conflicts.push([dep, blockDeps[dep], projectDeps[dep]]);
    }
  });
  return [lacks, conflicts];
}

/**
 * 删除重复依赖，projectDeps 中的依赖从 blockDeps 中删除
 * @param {*} blockDeps
 * @param {*} projectDeps
 */
export function filterDependenciesRepeat(blockDeps, projectDeps) {
  const filterDependencies = {};
  Object.keys(blockDeps).forEach(key => {
    if (!projectDeps[key]) {
      filterDependencies[key] = blockDeps[key];
    }
  });
  return filterDependencies;
}

export function getAllBlockDependencies(rootDir, pkg) {
  const { blockConfig = {}, dependencies = {} } = pkg;
  const { dependencies: depBlocks = [] } = blockConfig;
  const allDependencies = {};

  /**
   * 合并重复依赖
   * @param {*} blockDeps
   * @param {*} projectDeps
   */
  function mergeDependencies(parent, sub) {
    const [lacks, conflicts] = checkConflict(sub, parent);
    if (conflicts.length) {
      throw new Error(`
      find dependencies conflict between blocks:
      ${conflicts
        .map(info => `* ${info[0]}: ${info[2]} not compatible with ${info[1]}`)
        .join('\n')}`);
    }
    lacks.forEach(lack => {
      const [name, version] = lack;
      parent[name] = version;
    });
    return parent;
  }

  depBlocks.forEach(block => {
    const rubBlockDeps = getAllBlockDependencies(
      rootDir,
      // eslint-disable-next-line
      require(join(rootDir, block, 'package.json')),
    );
    mergeDependencies(allDependencies, rubBlockDeps);
  });
  mergeDependencies(allDependencies, dependencies);
  return allDependencies;
}

/**
 * 检查依赖项之间的冲突
 * @param {*}} blockPkgDeps
 * @param {*} projectPkgDeps
 * @param {*} blockPkgDevDeps
 * @param {*} projectPkgAllDeps
 */
export function dependenciesConflictCheck(
  blockPkgDeps = {},
  projectPkgDeps = {},
  blockPkgDevDeps = {},
  projectPkgAllDeps = {},
) {
  const [lacks, conflicts] = checkConflict(blockPkgDeps, projectPkgDeps);
  const [devLacks, devConflicts] = checkConflict(blockPkgDevDeps, projectPkgAllDeps);
  return {
    conflicts,
    lacks,
    devConflicts,
    devLacks,
  };
}

/**
 * 获取 mock 的依赖
 * @param {*} mockContent
 * @param {*} blockPkg
 */
export function getMockDependencies(mockContent, blockPkg) {
  const allDependencies = {
    ...blockPkg.devDependencies,
    ...blockPkg.dependencies,
  };
  const deps = {};
  try {
    crequire(mockContent).forEach(item => {
      if (allDependencies[item.path]) {
        deps[item.path] = allDependencies[item.path];
      }
    });
  } catch (e) {
    debug('parse mock content failed');
    debug(e);
  }

  return deps;
}

const singularReg = new RegExp(`['"](@/|[\\./]+)(${SINGULAR_SENSLTIVE.join('|')})/`, 'g');

export function parseContentToSingular(content) {
  return content.replace(singularReg, (all, prefix, match) =>
    all.replace(match, match.replace(/s$/, '')),
  );
}

export function getSingularName(name) {
  if (SINGULAR_SENSLTIVE.includes(name)) {
    name = name.replace(/s$/, '');
  }
  return name;
}

export const getBlockGenerator = (api: IApi) => {
  const { paths, userConfig, applyPlugins } = api;
  const blockConfig = userConfig?.block || {};

  return class BlockGenerator extends Generator {
    public isTypeScript;
    // 区块源目录路径（/tmp）
    public sourcePath;
    public dryRun;
    // 相对 pages 的目录
    public path;
    // 区块添加的目标路径
    public blockFolderPath;
    // 添加到的路由
    public routePath;
    public blockName;
    public isPageBlock;
    public execution;
    public needCreateNewRoute;
    public blockFolderName;
    public entryPath;
    public routes;
    public on;
    public prompt;
    public fs;
    public store;
    // 添加的 资产类型
    public blockType: 'block' | 'template';
    // 添加方式
    public addType: 'git' | 'files' = 'git';
    public files: string[];
    public blockPagesPath: string;

    constructor({ args, name }) {
      // @ts-ignore
      super({ args });

      this.store = memFs.create();
      this.fs = editor.create(this.store);

      this.isTypeScript = existsSync(join(args.env.cwd, 'tsconfig.json'));
      this.sourcePath = args.sourcePath;
      this.dryRun = args.dryRun;
      this.path = args.path;
      debug('this.path', this.path);
      this.routePath = args.routePath || args.path;
      this.blockName = args.blockName;
      this.isPageBlock = args.isPageBlock;
      this.execution = args.execution;
      this.needCreateNewRoute = this.isPageBlock;
      this.blockFolderName = upperCamelCase(this.blockName);
      // 这个参数是区块的 index.tsx | js
      this.entryPath = null;
      // 这个参数是当前区块的目录
      this.blockFolderPath = join(paths.absPagesPath, this.path);
      this.routes = args.routes || [];
      this.blockType = args.blockType;
      // 资产类型：git 还是 files
      this.addType = args.files ? 'files' : 'git';
      this.files = args.files || [];
      this.blockPagesPath = args.blockPagesPath || '';
    }

    run(): Promise<any> {
      return new Promise((resolve, reject) => {
        debug('run writing');
        this.writing()
          .then(() => {
            debug('run commit');
            this.fs.commit(() => {
              resolve();
            });
          })
          .catch(e => {
            reject(e);
          });
      });
    }

    // git 类型写入
    async gitBlockWriting() {
      let targetPath = winPath(join(paths.absPagesPath, this.path));
      debug(`this.path`, this.path);
      debug(`get targetPath ${targetPath}`);

      // for old page block check for duplicate path
      // if there is, prompt for input a new path
      if (isEmptyFolder(targetPath)) {
        rimraf.sync(targetPath);
      }

      while (this.isPageBlock && existsSync(targetPath)) {
        if (this.execution === 'auto') {
          throw new Error(`path ${this.path} already exist, press input a new path for it`);
        }
        // eslint-disable-next-line no-await-in-loop
        const prompt = await inquirer.prompt([
          {
            type: 'input',
            name: 'path',
            message: `path ${this.path} already exist, press input a new path for it`,
            required: true,
            default: this.path,
          },
        ]);
        this.path = prompt.path;
        // fix demo => /demo
        const exp = /^\//;
        if (!exp.test(this.path)) {
          this.path = `/${this.path}`;
        }
        targetPath = join(paths.absPagesPath, this.path);
        debug(`targetPath exist get new targetPath ${targetPath}`);
      }

      // 如果路由重复，重新输入
      while (this.isPageBlock && routeExists(this.routePath, this.routes)) {
        if (this.execution === 'auto') {
          throw new Error(
            `router path ${this.routePath} already exist, press input a new path for it`,
          );
        }
        // eslint-disable-next-line no-await-in-loop
        const routePrompt = await inquirer.prompt([
          {
            type: 'input',
            name: 'routePath',
            message: `router path ${this.routePath} already exist, press input a new path for it`,
            required: true,
            default: this.routePath,
          },
        ]);
        this.routePath = routePrompt.routePath;
        debug(`router path exist get new targetPath ${this.routePath}`);
      }

      this.blockFolderPath = targetPath;

      const blockPath = this.path;
      debug(`blockPath is ${blockPath}`);

      await applyPlugins({
        key: 'beforeBlockWriting',
        type: api.ApplyPluginsType.event,
        args: {
          sourcePath: this.sourcePath,
          blockPath,
        },
      });

      if (this.dryRun) {
        debug('dryRun is true, skip copy files');
        return;
      }

      // check for duplicate block name under the path
      // if there is, prompt for a new block name
      while (!this.isPageBlock && existsSync(join(targetPath, this.blockFolderName))) {
        // eslint-disable-next-line no-await-in-loop
        const blockFolderNamePrompt = await inquirer.prompt([
          {
            type: 'input',
            name: 'path',
            message: `block with name ${this.blockFolderName} already exist, please input a new name for it`,
            required: true,
            default: this.blockFolderName,
          },
        ]);
        this.blockFolderName = blockFolderNamePrompt.path;
        debug('this.blockFolderName', this.blockFolderName);
        // if (!/^\//.test(blockFolderName)) {
        //   blockFolderName = `/${blockFolderName}`;
        // }
        debug(`blockFolderName exist get new blockFolderName ${this.blockFolderName}`);
      }

      // create container
      this.entryPath =
        findJS({
          base: targetPath,
          fileNameWithoutExt: '',
        }) ||
        findJS({
          base: targetPath,
          fileNameWithoutExt: 'index',
        });

      debug('this.entryPath', this.entryPath);
      debug('targetPath', targetPath);

      if (!this.isPageBlock && !existsSync(this.entryPath)) {
        const confirmResult = (
          await inquirer.prompt([
            {
              type: 'confirm',
              name: 'needCreate',
              message: `Not find a exist page file at ${this.path}. Do you want to create it and import this block.`,
            },
          ])
        ).needCreate;

        if (!confirmResult) {
          throw new Error('You stop it!');
        }

        debug('start to generate the entry file for block(s) under the path...');

        this.needCreateNewRoute = true;
        debug('blockConfig.entryTemplatePath', blockConfig.entryTemplatePath);
        const defaultBlockEntryTplPath = join(winPath(__dirname), 'blockEntry.js.tpl');
        const blockEntryTpl = readFileSync(
          blockConfig.entryTemplatePath || defaultBlockEntryTplPath,
          'utf-8',
        );
        const tplContent = {
          blockEntryName: `${this.path.slice(1)}Container`,
        };
        const entry = Mustache.render(blockEntryTpl, tplContent);
        debug('targetPath', targetPath);
        mkdirp.sync(targetPath);
        debug('this.entryPath2', this.entryPath);
        writeFileSync(this.entryPath, entry);
      }

      // copy block to target
      // you can find the copy api detail in https://github.com/SBoudrias/mem-fs-editor/blob/master/lib/actions/copy.js
      debug('start copy block file to your project...');

      // 替换 相对路径
      // eslint-disable-next-line
      for (const folder of ['src', '@']) {
        if (!this.isPageBlock && folder === '@') {
          // @ folder not support anymore in new specVersion
          return;
        }
        const folderPath = join(
          this.sourcePath,
          folder,
          this.blockPagesPath && this.blockPagesPath !== 'src' ? this.blockPagesPath : '',
        );
        let targetFolder;
        if (this.isPageBlock) {
          targetFolder = folder === 'src' ? targetPath : paths.absSrcPath;
        } else {
          targetFolder = join(dirname(this.entryPath), this.blockFolderName);
        }
        const process = async (content, itemTargetPath) => {
          content = String(content);
          if (userConfig.singular) {
            content = parseContentToSingular(content);
          }
          content = replaceContent(content, {
            path: blockPath,
          });
          const blockFile = await applyPlugins({
            key: '_modifyBlockFile',
            type: api.ApplyPluginsType.modify,
            initialValue: content,
            args: {
              blockPath,
              targetPath: winPath(itemTargetPath),
            },
          });
          debug('itemTargetPath', winPath(itemTargetPath));
          return blockFile;
        };

        debug('folderPath', folderPath);
        if (existsSync(folderPath)) {
          // eslint-disable-next-line no-restricted-syntax
          for (let name of readdirSync(folderPath)) {
            // ignore the dot files
            if (name.charAt(0) === '.') {
              return;
            }
            const thePath = join(folderPath, name);
            if (statSync(thePath).isDirectory() && userConfig.singular) {
              // @/components/ => @/src/component/ and ./components/ => ./component etc.
              name = getSingularName(name);
            }
            // eslint-disable-next-line no-await-in-loop
            const realTarget = await applyPlugins({
              key: '_modifyBlockTarget',
              type: api.ApplyPluginsType.modify,
              initialValue: join(targetFolder, name),
              args: {
                source: thePath,
                blockPath,
                sourceName: name,
              },
            });
            debug(`copy ${thePath} to ${realTarget}`);

            // eslint-disable-next-line no-await-in-loop
            await this.fs.copyAsync(winPath(thePath), winPath(realTarget), { process });
          }
        }
      }
    }

    async filesBlockWriting() {
      let targetPath = winPath(join(paths.absPagesPath, this.path));
      debug(`this.path`, this.path);
      debug(`get targetPath ${targetPath}`);

      // for old page block check for duplicate path
      // if there is, prompt for input a new path
      if (isEmptyFolder(targetPath)) {
        rimraf.sync(targetPath);
      }
      while (this.isPageBlock && existsSync(targetPath)) {
        if (this.execution === 'auto') {
          throw new Error(`path ${this.path} already exist, press input a new path for it`);
        }
        // fix demo => /demo
        const exp = /^\//;
        if (!exp.test(this.path)) {
          this.path = `/${this.path}`;
        }
        targetPath = join(paths.absPagesPath, this.path);
        debug(`targetPath exist get new targetPath ${targetPath}`);
      }

      // 如果路由重复，重新输入
      while (this.isPageBlock && routeExists(this.routePath, this.routes)) {
        if (this.execution === 'auto') {
          throw new Error(
            `router path ${this.routePath} already exist, press input a new path for it`,
          );
        }
        debug(`router path exist get new targetPath ${this.routePath}`);
      }

      this.blockFolderPath = targetPath;

      const blockPath = this.path;
      debug(`blockPath is ${blockPath}`);

      if (this.dryRun) {
        debug('dryRun is true, skip copy files');
        return;
      }

      // check for duplicate block name under the path
      // if there is, prompt for a new block name
      while (!this.isPageBlock && existsSync(join(targetPath, this.blockFolderName))) {
        debug('this.blockFolderName', this.blockFolderName);
        // if (!/^\//.test(blockFolderName)) {
        //   blockFolderName = `/${blockFolderName}`;
        // }
        debug(`blockFolderName exist get new blockFolderName ${this.blockFolderName}`);
      }

      // create container
      this.entryPath =
        findJS({
          base: targetPath,
          fileNameWithoutExt: '',
        }) ||
        findJS({
          base: targetPath,
          fileNameWithoutExt: 'index',
        });
      debug('this.entryPath', this.entryPath);
      debug('targetPath', targetPath);

      if (!this.isPageBlock && !existsSync(this.entryPath)) {
        const confirmResult = (
          await inquirer.prompt([
            {
              type: 'confirm',
              name: 'needCreate',
              message: `Not find a exist page file at ${this.path}. Do you want to create it and import this block.`,
            },
          ])
        ).needCreate;

        if (!confirmResult) {
          throw new Error('You stop it!');
        }

        debug('start to generate the entry file for block(s) under the path...');

        this.needCreateNewRoute = true;
        debug('blockConfig.entryTemplatePath', blockConfig.entryTemplatePath);
        const defaultBlockEntryTplPath = join(winPath(__dirname), 'blockEntry.js.tpl');
        const blockEntryTpl = readFileSync(
          blockConfig.entryTemplatePath || defaultBlockEntryTplPath,
          'utf-8',
        );
        const tplContent = {
          blockEntryName: `${this.path.slice(1)}Container`,
        };
        const entry = Mustache.render(blockEntryTpl, tplContent);
        debug('targetPath', targetPath);
        mkdirp.sync(targetPath);
        debug('this.entryPath2', this.entryPath);
        writeFileSync(this.entryPath, entry);
      }

      // copy block to target
      // you can find the copy api detail in https://github.com/SBoudrias/mem-fs-editor/blob/master/lib/actions/copy.js
      debug('start files block file to your project...');

      // 替换 相对路径
      // eslint-disable-next-line
      for (const folder of ['src']) {
        // if (!this.isPageBlock && folder === '@') {
        //   // @ folder not support anymore in new specVersion
        //   return;
        // }
        debug('this.blockFolderName', this.blockFolderName);
        let targetFolder;
        if (this.isPageBlock) {
          targetFolder = folder === 'src' ? targetPath : paths.absSrcPath;
        } else {
          targetFolder = join(dirname(this.entryPath), this.blockFolderName);
        }
        const process = async (content, itemTargetPath) => {
          content = String(content);
          if (userConfig.singular) {
            content = parseContentToSingular(content);
          }
          content = replaceContent(content, {
            path: blockPath,
          });
          const blockFile = await applyPlugins({
            key: '_modifyBlockFile',
            type: api.ApplyPluginsType.modify,
            initialValue: content,
            args: {
              blockPath,
              targetPath: winPath(itemTargetPath),
            },
          });
          debug('itemTargetPath', winPath(itemTargetPath));
          return blockFile;
        };

        debug('files', Object.keys(this.files || {}));
        if (Object.keys(this.files || {}).length > 0) {
          if (!existsSync(targetFolder)) {
            mkdirp.sync(targetFolder);
          }
          // eslint-disable-next-line no-restricted-syntax
          for (const name of Object.keys(this.files)) {
            // ignore the dot files
            if (name.charAt(0) === '.') {
              return;
            }
            const realTarget = join(targetFolder, name);
            debug(`write ${name} to ${realTarget}`);
            if (this.files[name]) {
              // eslint-disable-next-line no-await-in-loop
              const content = await process(this.files[name], realTarget);
              this.fs.write(realTarget, content);
            }
          }
        }
      }
    }

    async writing(): Promise<void> {
      debug('this.addType', this.addType);
      if (this.addType !== 'files') {
        await this.gitBlockWriting();
      } else {
        // files 类型
        await this.filesBlockWriting();
      }
    }
  };
};
