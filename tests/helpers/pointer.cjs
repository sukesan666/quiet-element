async function pointAt(page,selector){
 const box=await page.locator(selector).boundingBox();if(!box)throw Error('No visible selection target: '+selector);
 return {x:box.x+Math.min(15,box.width/2),y:box.y+Math.min(15,box.height/2)};
}
async function hover(page,selector){const p=await pointAt(page,selector);await page.mouse.move(p.x,p.y);}
async function choose(page,selector){const p=await pointAt(page,selector);await page.mouse.move(p.x,p.y);await page.mouse.click(p.x,p.y);}
module.exports={hover,choose};
