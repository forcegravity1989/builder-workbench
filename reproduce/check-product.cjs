const {chromium}=require('playwright')
const path=require('node:path')
const {pathToFileURL}=require('node:url')
const fs=require('node:fs')
const assert=require('node:assert/strict')
;(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,ignoreDefaultArgs:['--hide-scrollbars']})
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const results=[]
  for(const [width,height] of [[1280,800],[1920,1080]]){
   await page.setViewportSize({width,height});await page.goto(pathToFileURL(path.resolve('out/overview-review/product.html')).href)
   await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.locator('.wb-ov-minutes-body h2').first().waitFor();await page.locator('.wb-mz-canvas svg').first().waitFor()
   const metrics=await page.evaluate(()=>({overflow:document.querySelector('.wb-ov .content').scrollWidth-document.querySelector('.wb-ov .content').clientWidth,firstRow:document.querySelector('.row-2').getBoundingClientRect().height,minutes:[...document.querySelectorAll('.wb-ov-minutes-body')].map(x=>({height:x.clientHeight,scroll:x.scrollHeight})),charts:document.querySelectorAll('.wb-mz-canvas svg').length}))
   assert.equal(metrics.overflow,0);assert(metrics.minutes.every(m=>m.height===256&&m.scroll>m.height));assert.equal(metrics.charts,4);assert(!(await page.locator('.wb-ov').textContent()).includes('NaN'))
   await page.screenshot({path:`out/overview-review/product-top-${width}.png`})
   const bodies=page.locator('.wb-ov-minutes-body');await bodies.first().evaluate(el=>el.scrollTop=100);assert.equal(await bodies.nth(1).evaluate(el=>el.scrollTop),0)
   await page.getByRole('tab',{name:'v0.4',exact:true}).click();assert.equal(await bodies.first().evaluate(el=>el.scrollTop),0)
   await page.getByLabel('纪要轮次').selectOption('C2');assert.equal(await bodies.first().evaluate(el=>el.scrollTop),0)
   await page.locator('#sdlc-zones').scrollIntoViewIfNeeded();
   await page.getByRole('button',{name:'提交',exact:true}).click();await page.getByRole('dialog',{name:'提交数据来源'}).waitFor();await page.keyboard.press('Escape');
   await page.screenshot({path:`out/overview-review/product-metrics-${width}.png`})
   await page.getByRole('button',{name:'设置指标',exact:true}).click();assert.equal(await page.evaluate(()=>window.setupCount),1)
   const setupStyle=await page.getByRole('button',{name:'设置指标',exact:true}).evaluate(el=>({border:getComputedStyle(el).borderWidth,background:getComputedStyle(el).backgroundColor}));assert.equal(setupStyle.border,'1px')
   await page.getByRole('group',{name:'业务指标粒度'}).getByRole('button',{name:'天',exact:true}).click()
   await page.getByRole('group',{name:'项目指标粒度'}).getByRole('button',{name:'天',exact:true}).click()
   await page.reload();await page.locator('.wb-mz-canvas svg').first().waitFor();assert.equal(await page.getByRole('tab',{name:'v0.4',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.getByRole('group',{name:'业务指标粒度'}).getByRole('button',{name:'天',exact:true}).getAttribute('aria-pressed'),'true')
   results.push({width,...metrics,setupStyle})
  }
  await page.goto(pathToFileURL(path.resolve('out/overview-review/product.html')).href+'?many=1');await page.locator('.wb-mz-canvas svg').first().waitFor();await page.locator('#metrics-zones').scrollIntoViewIfNeeded()
  const legend=page.locator('#metrics-zones svg text').filter({hasText:/^每周有效交付数$/});await legend.click();
  assert.equal(await page.evaluate(()=>Object.values(JSON.parse(sessionStorage.getItem(Object.keys(sessionStorage).find(k=>k.startsWith('bw:overview:')))).hidden)[0]),true);
  const box=await page.locator('#metrics-zones .wb-mz-canvas').boundingBox();await page.mouse.click(box.x+box.width-10,box.y+16);
  assert((await page.locator('#metrics-zones .wb-mz-canvas svg').textContent()).includes('2/2'));
  await page.locator('#metrics-zones .wb-mz-canvas').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);await page.screenshot({path:'out/overview-review/product-many-1920.png'})
  assert.equal(await page.evaluate(()=>document.querySelector('.wb-ov .content').scrollWidth-document.querySelector('.wb-ov .content').clientWidth),0)
  assert.deepEqual(errors,[]);fs.writeFileSync('out/overview-review/product-check.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}))
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})

