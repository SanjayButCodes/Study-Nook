import { remark } from 'remark';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

async function test() {
  const doc = "Test $\\frac{1}{2}$ and $x < y$";

  const result1 = await remark()
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeKatex)
    .use(rehypeStringify)
    .process(doc);

  console.log("With rehypeRaw first:");
  console.log(result1.toString());

  const result2 = await remark()
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(doc);

  console.log("\nWith rehypeKatex first:");
  console.log(result2.toString());
}
test();
