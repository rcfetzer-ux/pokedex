// Metro must be told about the workspace: @pokedex/shared lives outside this
// package, and without watchFolders + explicit nodeModulesPaths the bundler
// silently fails to resolve it (and never rebuilds when it changes).
const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Hoisted workspace deps would otherwise be resolvable by two different paths,
// which is how you end up with two copies of React in one bundle.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
