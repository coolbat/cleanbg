import type { ToolPresetId } from '@/features/remover/presets';

export const INTENT_IDS = [
  'white-background',
  'transparent-png',
  'logo',
  'passport-photo',
  'iphone-heic',
] as const;

export type IntentId = (typeof INTENT_IDS)[number];

export type IntentFaq = { question: string; answer: string };

export type IntentPageCopy = {
  id: IntentId;
  path: string;
  preset: ToolPresetId;
  navLabel: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  fit: string;
  notFit: string;
  caution?: string;
  faqs: IntentFaq[];
};

type Bundle = {
  fitHeading: string;
  notFitHeading: string;
  relatedHeading: string;
  faqHeading: string;
  pages: Record<IntentId, IntentPageCopy>;
};

const en: Bundle = {
  fitHeading: 'A good fit',
  notFitHeading: 'Use another page',
  relatedHeading: 'Other exports',
  faqHeading: 'Questions',
  pages: {
    'white-background': {
      id: 'white-background',
      path: '/white-background',
      preset: 'white',
      navLabel: 'White background',
      title: 'White background remover — pure white, no upload',
      description:
        'Remove a background and export a pure white (#FFFFFF) JPEG on your device. Optional square padding for listing photos. Nothing is uploaded.',
      h1: 'Put a subject on a pure white background',
      lead: 'The cutout stays in this tab. The download defaults to a white JPEG, padded to a square. Uncheck “Pad to square” if you want the original frame.',
      fit: 'Product shots, headshots, and listing photos that need a flat white field behind the subject.',
      notFit: 'Artwork that has to keep a real alpha channel. Export a transparent PNG for that.',
      faqs: [
        {
          question: 'Is the white exactly #FFFFFF?',
          answer:
            'Yes. The empty area is filled with #FFFFFF before the JPEG is encoded. JPEG has no transparency, so that white is part of the file.',
        },
        {
          question: 'Does this make the photo marketplace-ready?',
          answer:
            'It gives you a white background and an optional square frame. It does not check fill ratio, minimum pixels, or a store’s current image rules. Match those yourself.',
        },
        {
          question: 'Is the photo uploaded?',
          answer:
            'No. The model runs in your browser. The JPEG is composed in memory and downloaded to your device.',
        },
      ],
    },
    'transparent-png': {
      id: 'transparent-png',
      path: '/transparent-png',
      preset: 'transparent',
      navLabel: 'Transparent PNG',
      title: 'Transparent PNG maker — remove the background, no upload',
      description:
        'Turn a photo into a transparent PNG in the browser. Preview the cutout on white and on black before you download. The file never leaves your device.',
      h1: 'Download a PNG with a real alpha channel',
      lead: 'Empty pixels stay empty. After a cutout, the same result is shown on white and on black so stray edges are easy to see.',
      fit: 'Cutouts you will place on another color, a slide, or a design.',
      notFit: 'A flat white file for a marketplace. JPEG cannot store transparency — use the white-background export for that.',
      faqs: [
        {
          question: 'Why does a JPEG look white?',
          answer:
            'JPEG has no alpha channel. If you switch the format to JPG, empty pixels are filled white. Stay on PNG when the background has to stay empty.',
        },
        {
          question: 'How do I check the edges?',
          answer:
            'The light and dark previews under the result use the same PNG. A halo that disappears on white often shows up on black.',
        },
        {
          question: 'Is the photo uploaded?',
          answer: 'No. Processing and the PNG export both happen in this tab.',
        },
      ],
    },
    logo: {
      id: 'logo',
      path: '/logo',
      preset: 'logo',
      navLabel: 'Logo',
      title: 'Remove the background from a logo — transparent PNG',
      description:
        'Turn a logo on a photo or flat color into a transparent PNG, in the browser. JPEG fills the empty pixels white. The file is not uploaded.',
      h1: 'Make a logo a transparent PNG',
      lead: 'Drop a wordmark or icon. Export PNG. A JPEG puts a white box back around the mark, because JPEG cannot store transparency.',
      fit: 'Logos and icons sitting on a simple photo or a flat color you want gone.',
      notFit: 'Marks whose colored shape is part of the logo, such as a disc you need to keep. Paint that area back with the mask brush.',
      faqs: [
        {
          question: 'Will thin lettering stay sharp?',
          answer:
            'Quality mode runs a second, closer pass and helps on small marks. Very thin lines and fine type can still chip. Check the dark preview before you ship the file.',
        },
        {
          question: 'Can I download a JPG of a transparent logo?',
          answer:
            'You can, and the empty area becomes white. For a logo that has to sit on any color, download PNG.',
        },
        {
          question: 'Is the file uploaded?',
          answer: 'No. The logo is decoded and processed on your device.',
        },
      ],
    },
    'passport-photo': {
      id: 'passport-photo',
      path: '/passport-photo',
      preset: 'passport',
      navLabel: 'Passport-style',
      title: 'Remove a portrait background privately — not an official ID photo',
      description:
        'Replace a portrait background with white on your own device. This is not an official passport or visa photo service and does not check government rules.',
      h1: 'Change a portrait background without uploading the face',
      lead: 'The download starts as a white square JPEG. Use it when the picture should stay on this device. It is not a passport, visa, or ID photo product.',
      fit: 'A private preview of a face on a plain white field, before you follow an agency’s own instructions.',
      notFit: 'Submitting an official document photo. Size, head position, expression, and the exact background shade are rules this page does not check.',
      caution:
        'CleanBG only removes a background locally. It does not produce an official passport, visa, or ID photo, and it does not claim to meet any government’s specification.',
      faqs: [
        {
          question: 'Is this an official passport photo?',
          answer:
            'No. Agencies specify dimensions, head size, eye line, expression, and background. This page does not measure any of that. Follow the instructions from the authority that asked for the photo.',
        },
        {
          question: 'Does the portrait leave this device?',
          answer:
            'No. There is no upload. The model runs in the browser, and the JPEG is downloaded to you.',
        },
        {
          question: 'What does the default export look like?',
          answer:
            'A square JPEG with a #FFFFFF background. Turn square padding off, or pick another color, if your instructions say something else.',
        },
      ],
    },
    'iphone-heic': {
      id: 'iphone-heic',
      path: '/iphone-heic',
      preset: 'heic',
      navLabel: 'iPhone HEIC',
      title: 'Remove the background from an iPhone HEIC photo',
      description:
        'Drop an iPhone HEIC file and remove the background in the browser. Safari decodes HEIC natively. Other browsers decode it locally. The photo is not uploaded.',
      h1: 'Remove the background from a HEIC photo',
      lead: 'You do not need to convert the camera roll to JPEG first. Drop the HEIC file. The result defaults to a transparent PNG.',
      fit: 'Photos that are still .HEIC or .HEIF from an iPhone.',
      notFit: 'A file you already exported as JPEG or PNG. The home page handles those the same way, without the HEIC decoder.',
      faqs: [
        {
          question: 'Do I have to convert HEIC to JPEG first?',
          answer:
            'No. Drop the HEIC file. Safari decodes it itself. Chrome, Edge, and Firefox load a local copy of libheif only for that file, still in this tab.',
        },
        {
          question: 'Is the iPhone photo uploaded to decode it?',
          answer:
            'No. Decoding and background removal both happen on the device. The legal notice for libheif is on the licenses page.',
        },
        {
          question: 'What do I download?',
          answer:
            'A transparent PNG at the photo’s resolution, unless you switch the background or the format. HEIC itself is only the input.',
        },
      ],
    },
  },
};

const zh: Bundle = {
  fitHeading: '适合',
  notFitHeading: '换一页',
  relatedHeading: '其他导出',
  faqHeading: '常见问题',
  pages: {
    'white-background': {
      id: 'white-background',
      path: '/white-background',
      preset: 'white',
      navLabel: '白底',
      title: '白底抠图 — 纯白背景，不上传',
      description:
        '在浏览器里去掉背景，导出纯白（#FFFFFF）JPEG。需要方图时可以垫成方形。照片不会上传。',
      h1: '把主体放到纯白背景上',
      lead: '抠图在当前标签页完成。下载默认是白底 JPEG，并垫成方形。要保留原来的画幅，取消「垫成方形」。',
      fit: '需要一块干净白底的商品图、头像和上架图。',
      notFit: '必须保留真正透明通道的设计稿。那种情况请导出透明 PNG。',
      faqs: [
        {
          question: '白色是不是 #FFFFFF？',
          answer: '是。空白在编码 JPEG 之前填成 #FFFFFF。JPEG 没有透明，这块白色会写进文件。',
        },
        {
          question: '这样就能直接上架吗？',
          answer:
            '这里只提供白底和可选的方形画幅，不检查主体占比、最小像素或某个平台当下的图片规则。那些要求需要你自己对照。',
        },
        {
          question: '照片会上传吗？',
          answer: '不会。模型在浏览器里运行，JPEG 在内存中合成后下载到你的设备。',
        },
      ],
    },
    'transparent-png': {
      id: 'transparent-png',
      path: '/transparent-png',
      preset: 'transparent',
      navLabel: '透明 PNG',
      title: '透明 PNG — 去除背景，不上传',
      description:
        '在浏览器里把照片做成带透明通道的 PNG。下载前可以在白底和黑底上检查边缘。文件不会离开这台设备。',
      h1: '下载一张真正带透明通道的 PNG',
      lead: '空白像素保持空白。抠完之后，同一张结果会分别放在白底和黑底上，方便看出残留的边。',
      fit: '还要放到别的颜色、幻灯片或设计稿上的切图。',
      notFit: '只要一张纯白底文件。JPEG 存不了透明，请用白底导出。',
      faqs: [
        {
          question: '为什么存成 JPEG 又变成白底？',
          answer: 'JPEG 没有透明通道。格式改成 JPG 时，空白会被填白。需要镂空就保持 PNG。',
        },
        {
          question: '怎么检查边缘？',
          answer: '结果下方的浅色底和深色底用的是同一张 PNG。白底上看不见的白边，黑底上通常会露出来。',
        },
        {
          question: '照片会上传吗？',
          answer: '不会。处理和导出都在这个标签页里完成。',
        },
      ],
    },
    logo: {
      id: 'logo',
      path: '/logo',
      preset: 'logo',
      navLabel: 'Logo',
      title: '去除 Logo 背景 — 透明 PNG',
      description:
        '把拍在照片上或纯色底上的 Logo 做成透明 PNG，全程在浏览器内。JPEG 会把空白填白。文件不会上传。',
      h1: '把 Logo 做成透明 PNG',
      lead: '拖入文字标或图标，导出 PNG。JPEG 会在标志周围补回一块白底，因为它存不了透明。',
      fit: '放在简单照片或纯色底上、希望把那层底去掉的标志和图标。',
      notFit: '色块本身就是标志的一部分，比如必须留下的圆底。用蒙版笔刷把那一块涂回来。',
      faqs: [
        {
          question: '细字体会不会糊？',
          answer:
            '高质量模式会再近距离跑一遍，对小标志有帮助。特别细的线和字仍可能缺角。发出去之前看一眼深色底预览。',
        },
        {
          question: '透明 Logo 能存成 JPG 吗？',
          answer: '可以存，空白会变成白色。标志要叠在任意颜色上时，请下载 PNG。',
        },
        {
          question: '文件会上传吗？',
          answer: '不会。解码和处理都在你的设备上。',
        },
      ],
    },
    'passport-photo': {
      id: 'passport-photo',
      path: '/passport-photo',
      preset: 'passport',
      navLabel: '人像白底',
      title: '私下换掉人像背景 — 不是官方证件照',
      description:
        '在自己的设备上把人像背景换成白色。这不是护照、签证或证件照服务，也不检查任何官方规格。',
      h1: '换掉人像背景，脸不必上传',
      lead: '下载默认是白底方形 JPEG，适合希望照片留在这台设备上的预览。它不是护照、签证或证件照产品。',
      fit: '在按机构自己的说明去拍之前，先在本地看一张白底人像。',
      notFit: '提交官方证件照。尺寸、头部位置、表情和背景色号都不是这一页会检查的项目。',
      caution:
        'CleanBG 只在本地去掉背景。它不制作官方护照、签证或证件照，也不声称符合任何国家的规格。',
      faqs: [
        {
          question: '这是官方护照照片吗？',
          answer:
            '不是。受理机构会规定尺寸、头部大小、眼线和背景。这一页不测量这些。请按向你要照片的机构自己的说明来做。',
        },
        {
          question: '人像会离开这台设备吗？',
          answer: '不会。没有上传。模型在浏览器里运行，JPEG 下载到你这里。',
        },
        {
          question: '默认导出是什么样？',
          answer: '一张 #FFFFFF 白底的方形 JPEG。如果说明里写的是别的颜色或画幅，关掉方形留白或改背景色。',
        },
      ],
    },
    'iphone-heic': {
      id: 'iphone-heic',
      path: '/iphone-heic',
      preset: 'heic',
      navLabel: 'iPhone HEIC',
      title: '去除 iPhone HEIC 照片的背景',
      description:
        '直接拖入 iPhone 的 HEIC 文件，在浏览器里去除背景。Safari 原生解码，其他浏览器在本地解码。照片不会上传。',
      h1: '去掉 HEIC 照片的背景',
      lead: '不必先把相册转成 JPEG。直接拖入 HEIC，结果默认是透明 PNG。',
      fit: '仍是 iPhone 的 .HEIC 或 .HEIF 原文件。',
      notFit: '已经导出成 JPEG 或 PNG 的照片。首页用同样的方式处理，不必再走 HEIC 解码。',
      faqs: [
        {
          question: '要先把 HEIC 转成 JPEG 吗？',
          answer:
            '不用。直接拖入 HEIC。Safari 自己解码。Chrome、Edge 和 Firefox 只在打开这种文件时，于当前标签页加载一份本地 libheif。',
        },
        {
          question: '解码会把照片传上去吗？',
          answer: '不会。解码和抠图都在设备上完成。libheif 的许可说明在许可证页面。',
        },
        {
          question: '下载下来是什么？',
          answer: '默认是原分辨率的透明 PNG，除非你改了背景或格式。HEIC 只是输入格式。',
        },
      ],
    },
  },
};

function bundle(locale: string): Bundle {
  return locale === 'zh' ? zh : en;
}

export function getIntent(id: IntentId, locale: string): IntentPageCopy {
  return bundle(locale).pages[id];
}

export function intentChrome(locale: string) {
  const { fitHeading, notFitHeading, relatedHeading, faqHeading } = bundle(locale);
  return { fitHeading, notFitHeading, relatedHeading, faqHeading };
}

export function intentLinks(locale: string): { href: string; label: string; id: IntentId }[] {
  const pages = bundle(locale).pages;
  return INTENT_IDS.map((id) => ({
    id,
    href: pages[id].path,
    label: pages[id].navLabel,
  }));
}
