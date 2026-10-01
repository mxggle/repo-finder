import fs from 'node:fs'
import path from 'node:path'
import { builtinModules } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')))
const sourcePattern = /\.[cm]?[jt]sx?$/
const testFile = name => /(?:^|\/)(?:test\/|testing\.[cm]?[jt]sx?$)|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name)
const feature = name => /^features\/([^/]+)\//.exec(name)?.[1]
const domain = name => name.startsWith('domain/')
const css = name => /\.(?:css|scss|sass|less)(?:\?.*)?$/.test(name)

export function checkBoundaries(root) {
  const src = path.join(root, 'src')
  const files = []
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (sourcePattern.test(file)) files.push(file)
    }
  }
  walk(src)
  const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.app.json')
  const config = configPath ? ts.readConfigFile(configPath, ts.sys.readFile) : { config: {} }
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options
  const errors = []
  const relative = file => path.relative(src, file).replaceAll(path.sep, '/')
  for (const file of files) {
    const from = relative(file)
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const report = (node, message) => {
      const { line } = ast.getLineAndCharacterOfPosition(node.getStart(ast))
      errors.push(`${from}:${line + 1}: ${message}`)
    }
    const helper = testFile(from)
    function inspectImport(node, specifier) {
      if (css(specifier)) return
      if (domain(from) && !helper && /^(?:react(?:-dom)?|@tanstack\/react-query)(?:\/|$)/.test(specifier)) report(node, 'domain cannot import React or UI query runtime')
      if (builtins.has(specifier.replace(/^node:/, '')) || specifier.startsWith('node:')) {
        report(node, `browser source cannot import Node module "${specifier}"`)
        return
      }
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule?.resolvedFileName
      const internal = specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('src/') || Object.keys(options.paths ?? {}).some(alias => specifier.startsWith(alias.replace(/\*.*$/, '')))
      if (!resolved) {
        if (internal) report(node, `unresolved internal import "${specifier}"`)
        return
      }
      const target = relative(resolved)
      if (target.startsWith('../')) {
        if (!resolved.includes(`${path.sep}node_modules${path.sep}`)) report(node, `browser source cannot import outside src: "${specifier}"`)
        return
      }
      if (!helper && testFile(target)) report(node, 'production source cannot import tests or testing helpers')
      if (helper) return
      const ownFeature = feature(from)
      const targetFeature = feature(target)
      if (ownFeature && (target.startsWith('app/') || targetFeature && targetFeature !== ownFeature)) report(node, 'feature cannot import app or another feature')
      if (from.startsWith('shared/') && /^(?:app|features|domain)\//.test(target)) report(node, 'shared cannot import app, features, or domain')
      if (domain(from) && /^(?:app|features|shared\/ui)\//.test(target)) report(node, 'domain cannot import app, features, or shared UI')
      if (targetFeature && targetFeature !== ownFeature && !/^features\/[^/]+\/index\.[cm]?[jt]sx?$/.test(target)) report(node, 'external feature imports must use its public index')
      if (domain(target) && !domain(from) && !/^domain\/repository\/index\.[cm]?[jt]sx?$/.test(target)) report(node, 'external domain imports must use domain/repository public index')
    }
    function visit(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) inspectImport(node, node.moduleSpecifier.text)
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) inspectImport(node, node.argument.literal.text)
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) inspectImport(node, node.moduleReference.expression.text)
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
        const arg = node.arguments[0]
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) inspectImport(node, arg.text)
        else report(node, 'computed module imports cannot be checked')
      }
      if (domain(from) && !helper && ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'globalThis' && ['window', 'document', 'navigator', 'fetch', 'localStorage', 'sessionStorage', 'process', 'Buffer'].includes(node.name.text)) report(node, `domain cannot use runtime global ${node.name.text}`)
      if (domain(from) && !helper && ts.isIdentifier(node) && ['window', 'document', 'navigator', 'fetch', 'localStorage', 'sessionStorage', 'process', 'Buffer', 'global', '__dirname', '__filename'].includes(node.text)) {
        // Property names and declared identifiers are not runtime global reads.
        if (!(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node) && !(ts.isDeclarationName(node))) report(node, `domain cannot use runtime global ${node.text}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
    if (!helper && /^features\/[^/]+\/index\.[cm]?[jt]sx?$/.test(from)) {
      for (const statement of ast.statements) {
        if (!ts.isExportDeclaration(statement)) report(statement, 'feature public index must contain only explicit re-exports')
        else if (!statement.exportClause) report(statement, 'feature public index must name its exports explicitly')
      }
    }
  }
  return errors
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = checkBoundaries(process.cwd())
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exitCode = 1
  } else console.log('Architecture boundaries passed')
}
