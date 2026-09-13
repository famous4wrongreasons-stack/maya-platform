// Run the reference/lifecycle fixture; assertions live in reference-proof.js.
// Uses a local synthetic page, never production identities or microphone access.
module.exports=async function(page,out){
 await page.goto('http://127.0.0.1:8879/proof.html');
 await page.locator('#result[data-pass]').waitFor();
 const result=await page.locator('#result').textContent();
 if(await page.locator('#result').getAttribute('data-pass')!=='true')throw Error(result);
 if(out)await page.screenshot({path:out});
 return {referenceAndLifecycle:'PASS',checks:result};
};
