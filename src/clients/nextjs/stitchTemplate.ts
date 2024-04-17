import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';

const handlerFile = 'HANDLER_FILE_PATH';
const templateFile = 'TEMPLATE_FILE.cjs';

const stitchingPlugin = ({
  templateCode,
  sourceCode,
  map,
  defaultExport = false
}: {
  templateCode: string;
  sourceCode: string;
  map: any;
  defaultExport: boolean;
}) => {
  return {
    name: 'inject-source',
    resolveId: (id: string) => {
      if (id === handlerFile || id === templateFile) {
        return id;
      }
      return null;
    },
    load(id: string) {
      if (id === templateFile) {
        return defaultExport
          ? templateCode
          : templateCode.replace('export { default } from', 'export {} from');
      } else if (id === handlerFile) {
        console.log('Injecting source code');
        return {
          code: sourceCode,
          map: map
        };
      }
      return null;
    }
  };
};

export default async function stitchTemplate(
  tplCode: string,
  sourceCode: string,
  map: any
) {
  const wrap = async (defaultExport = false) => {
    return rollup({
      input: templateFile,
      plugins: [
        stitchingPlugin({
          templateCode: tplCode,
          sourceCode,
          map,
          defaultExport
        }),
        commonjs({
          sourceMap: true,
          strictRequires: true,
          ignoreDynamicRequires: true,
          ignore: () => true
        })
      ],
      external: (sourceId) =>
        sourceId !== handlerFile && sourceId !== templateFile,
      context: 'this',
      makeAbsoluteExternalsRelative: false,
      onwarn: (warning, warn) => {}
    });
  };

  let rollupBuild;
  try {
    rollupBuild = await wrap();
  } catch (e) {
    // @ts-ignore
    if (e?.code === 'MISSING_EXPORT') {
      rollupBuild = await wrap(false);
    } else {
      throw e;
    }
  }

  const { output } = await rollupBuild.generate({
    format: 'esm',
    sourcemap: 'hidden'
  });

  return output[0];
}
