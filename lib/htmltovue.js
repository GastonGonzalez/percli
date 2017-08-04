const maven = require('maven')
const fs    = require('fs-extra')
const path  = require('path')
const html = require('html')
const cheerio = require('cheerio')

const templates = require('../templates/index.js')
const generator = require('../lib/generator.js')
const functions = require('../lib/functions.js')

function htmltovueAll(container, compile, deploy) {
    const components = fs.readdirSync('./fragments')
    for(let i = 0; i < components.length; i++) {
        if(fs.lstatSync('./fragments/'+components[i]).isDirectory())
        htmltovue(components[i])
    }
    if(compile) {
        const p = require('child_process')
        const cmd = p.execSync('mvn clean install -PautoInstallPackage', {stdio:[0,1,2]})
    }

}

function htmltovue(name, container, compile, deploy) {

    const componentName = name.toLowerCase()
    const ComponentName = componentName.charAt(0).toUpperCase() + componentName.slice(1)

    console.log('updating vue template for', componentName)

    const settings = JSON.parse(fs.readFileSync('./.properties/settings.json').toString())

    const projectName = settings.appname

    let templatePath = templates.getPath()
    let projectPath = process.cwd()
    // should check that we are in the root of the project
    // console.log('template  path:',templatePath)
    // console.log('project   path:',projectPath)

    let componentPath = path.join(projectPath, './fragments/'+componentName)
    // console.log('component path:',componentPath)

    let blockGenerator = path.join(projectPath, './fragments', componentName,'blockgenerator')
    if(fs.existsSync(blockGenerator) || fs.existsSync(blockGenerator+'.txt')) {
        console.log('generation of component blocked as per '+blockGenerator+' file')
    } else {

        let uiAppsComponentPath = path.join(projectPath, './ui.apps/src/main/content/jcr_root/apps/', projectName, 'components', componentName)
        let coreModelsPath = path.join(projectPath, './core/src/main/java/com', projectName, 'models')

        const html2vue = require(path.join(componentPath, 'htmltovue.js'))
        const $ = cheerio.load(fs.readFileSync(path.join(componentPath, 'template.html')))
        const el = ($('body').children().first())
        html2vue.convert(el, functions)
        const code = $.html(el)
        const out = html.prettyPrint('<template>'+code+'</template>', {indent_size: 2, unformatted: []})

        const templateVue = fs.readFileSync(path.join(componentPath, 'template.vue')).toString()
        const newTemplateVue = templateVue.replace(/^<template>[\s\S]*^<\/template>/m, out).replace(/&apos;/g, '\'')
        fs.writeFileSync(path.join(componentPath, 'template.vue'), newTemplateVue)

        // copy template.vue file to component
        fs.writeFileSync(path.join(uiAppsComponentPath, 'template.vue')  , fs.readFileSync(path.join(componentPath, 'template.vue')).toString())

        const def = JSON.parse(fs.readFileSync(path.join(componentPath, 'model.json')).toString())
        // make dialog.json for component
        fs.writeFileSync(path.join(uiAppsComponentPath, 'dialog.json'), JSON.stringify(functions.createDialog(def.definitions[ComponentName], true, 2)))

        // make model for component
        fs.mkdirsSync(coreModelsPath)
        def.name = ComponentName
        def.componentPath = projectName + '/components/' + componentName
        def.package = 'com.'+projectName+'.models'
        def.modelName = ComponentName
        def.classNameParent = 'AbstractComponent'
        if(container) def.classNameParent = 'Container'
        generator.generate(path.join(templates.getPath(),'model.java.template.java'), path.join(coreModelsPath, ComponentName + 'Model.java'), def)

        if(compile) {
            console.log('force compile of component')
            process.chdir('ui.apps')
            const p = require('child_process')
            const cmd = p.execSync('npm run build '+componentName, {stdio:[0,1,2]})
            if(deploy) {
                console.log('force upload of component')
                const slang = require('../lib/slang')
                slang.setOptions({
                    port: 8080,
                    host: 'localhost'
                })

                const appName = JSON.parse(fs.readFileSync('../.properties/settings.json')).appname
                console.log(appName)

                process.chdir('target/classes')
                slang.up('etc/felibs/'+appName+'/js.txt').then(function(status) {
                    console.log('success',status)
                }).catch(function(status, err) {
                    console.error('error', status, err)
                });
                slang.up('etc/felibs/'+appName+'/css.txt').then(function(status) {
                    console.log('success',status)
                }).catch(function(status, err) {
                    console.error('error', status, err)
                });
                slang.up('etc/felibs/'+appName+'/js/'+appName+'Components'+componentName.charAt(0).toUpperCase()+componentName.substring(1)+'.js').then(function(status) {
                    console.log('success',status)
                }).catch(function(status, err) {
                    console.error('error', status, err)
                });
            }
        }

    }
}

module.exports = {
    htmltovue: htmltovue,
    htmltovueAll: htmltovueAll
}