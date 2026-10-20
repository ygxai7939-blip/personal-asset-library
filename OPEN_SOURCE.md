# 素材库 · 个人本地版 开源复用与许可说明

本试用版不是 Eagle 的官方产品，也不是把某个完整开源素材管理软件改名。

经核查，SekerEagle 原项目的账号隔离与多服务部署不直接符合本项目的精简素材库需求，因此没有整体部署或整体分叉其后台。当前个人桌面版在原应用基础上增加本地生命周期、分类管理和库迁移。

实际复用代码：

- 来源：[Seker800/SekerEagle](https://github.com/Seker800/SekerEagle)
- 检查时提交：`29f924d03467897d813e98f135f2b9204a78b73a`
- 文件：`packages/eagle-filter-core/src/index.ts`
- 本项目保存为 `vendor/eagle-filter-core.ts`，未修改原文件。
- 使用其筛选字段定义生成素材评分选项；高级条件编辑不在首版范围。
- 许可：Apache-2.0，原许可与 NOTICE 保存在 `licenses/`。
- 未复用独立 GPL 许可的 MLX 模型组件，也未包含 AI 模型。

另复用了 React Bits 的可用源码组件 Lattice Loader：

- [组件页](https://www.reactbits.dev/micro/lattice-loader)，[官方源码注册表 JS/CSS](https://reactbits.dev/r/LatticeLoader-JS-CSS.json)，获取日期 2026-10-19。
- 未修改的原始组件和样式保存在 `vendor/react-bits/`；本项目适配版在 `ui/components/`，用于实际加载状态。
- 原 JSX SHA-256：`db7cca7b929adf93e33bd9636a077e3b755d9142fd8a1beab5bc90855fc0272d`；原 CSS SHA-256：`db8d5628298fff6d02b44bb4d31a455578ceece2dfa84769bc8a26e416af5790`。
- 修改包含经典 JSX 构建适配、中文状态与计时、无计时版本停用定时器、减少动态效果支持及深灰界面适配；没有新增动画依赖。
- 版权归 David Haz，2026。许可为 MIT + Commons Clause，原文保存在 `licenses/ReactBits-LICENSE.md`，并非无附加条件的纯 MIT；官方许可允许作为应用的一部分使用，但限制单独出售、再许可或分发组件本身。本项目仅在内部应用中使用，后续若对外分发仍需随应用保留此许可和版权说明。

侧边栏另适配 React Bits Branched Menu：

- [组件页](https://www.reactbits.dev/micro/branched-menu)，[官方 JS/CSS 注册表](https://reactbits.dev/r/BranchedMenu-JS-CSS.json)，获取日期 2026-10-19。
- 原始 JSX/CSS 保存在 `vendor/react-bits/BranchedMenu.*`；适配版在 `ui/components/BranchedMenu.*`。
- 原 JSX SHA-256：`ef27b050487d41091324874f16ab253567215756fc9b8260e8d934de381385e3`；CSS SHA-256：`9f483b0c5395623b8d7faf47978d34bf826b8cf1caf8ba4406d42a53ae8e6f83`。
- 复用分支路径几何与展开、路径描画样式；改为递归类别和受控选中/折叠状态，读取实际分类计数，允许父分类筛选，并用 ResizeObserver 适配子层级高度。
- 沿用已有 Lucide 图标，没有引入原组件默认示例使用的 Hugeicons 依赖。按用户要求采用透明菜单、透明分类行与中性灰文字/路径层级，保留减少动态效果偏好和键盘焦点提示。
- 同为 David Haz 2026 的 MIT + Commons Clause，原文见 `licenses/ReactBits-LICENSE.md`，上述使用条件仍适用。

部分操作按钮适配 React Bits Magnet：

- [组件页](https://www.reactbits.dev/animations/magnet)，[官方 JS/CSS 注册表](https://reactbits.dev/r/Magnet-JS-CSS.json)，获取日期 2026-10-19；该版本实际提供独立 JSX，无新增依赖。
- 原始文件为 `vendor/react-bits/Magnet.jsx`，SHA-256：`f1651ba9a8470ba8f7ba9a90edd0fe3ad44d15016279203558a1e6e2672e5425`；适配版在 `ui/components/Magnet.jsx`。
- 保留原组件弹簧计算、共享事件监听、相邻目标仲裁和空闲停止机制；添加 span 容器、固定原生按钮点击区域、可见按钮命中检测、禁用状态处理、键盘重置与实时减少动态效果偏好。
- 应用在部分按钮的文字与图标，侧边栏、素材卡片、评分、删除和窗口控制不采用磁吸。幅度约 2–3px，无缩放和倾斜；配套样式在 `ui/components/Magnet.css`。
- 同为 David Haz 2026 的 MIT + Commons Clause，使用条件与保留的原文见 `licenses/ReactBits-LICENSE.md`。

素材浏览区适配 React Bits Masonry：

- [组件页](https://www.reactbits.dev/components/masonry)，[官方 JS/CSS 注册表](https://reactbits.dev/r/Masonry-JS-CSS.json)，获取日期 2026-10-19。
- 原始文件为 `vendor/react-bits/Masonry.jsx` 和 `Masonry.css`；JSX SHA-256：`27b38501bcf6f2f79d9a35938266bc6517bbafce318fcfb1068dcab91d1cbeee`；CSS SHA-256：`59f265bb064c777da9c4ec549f378cf52c56a3719122196bbf77ffb3b2f28ea8`。
- 适配版在 `ui/components/Masonry.jsx`，复用最短列布局、响应式列宽和阻尼弹簧重排核心，加入固定顶部名称区域与缩略图实际比例测量。
- 使用素材库原有卡片、选择、排序、图片/视频预览与回收站功能，没有接入原组件的独立灯箱、拖动重排、视差或悬停倾斜；没有新增其示例所用 Hugeicons 依赖。图片使用现有缩略图，按需加载。
- 同为 David Haz 2026 的 MIT + Commons Clause，许可原文和使用条件继续保留在 `licenses/ReactBits-LICENSE.md`。

全局底层背景适配 React Bits Dot Grid：

- [组件页](https://www.reactbits.dev/backgrounds/dot-grid)，[官方 JS/CSS 注册表](https://reactbits.dev/r/DotGrid-JS-CSS.json)，获取日期 2026-10-19。原始文件保留在 `vendor/react-bits/DotGrid.jsx` 和 `DotGrid.css`。
- 原始 JSX SHA-256：`66f50ebc070bb3d02eb46b8b1b58334c3ce513da160d97e6a8a96fbf9ad3909f`；CSS SHA-256：`41da475e62d101909c5f958569214c38cf20441223059d07a3e56b4e9a176a51`。
- 适配版 `ui/components/DotGrid.jsx` 保留其 WebGL2 绘制、弹簧物理和点击波纹；`AppBackdrop.jsx` 集中保存用户 URL 参数，连接/登录页和主界面中间 workspace 分别在自身范围内显示，侧边栏不使用点阵。
- 修改包括经典 JSX 支持、着色器错误处理及资源清理、无 WebGL2/上下文丢失时静态 CSS 点阵降级、减少动态效果实时切换、原生窗口状态及网页可见性暂停、DPR 上限 1.5、输入与实色面板区域不驱动背景。
- 同为 MIT + Commons Clause，原许可保留于 `licenses/ReactBits-LICENSE.md`；没有引入新的运行依赖。原始组件不单独对外分发。

运行所用开源基础组件：Electron、React、Express、Multer、Sharp、Lucide、SQLite；具体版本以 `package-lock.json` 为准。依赖的许可证以各包内 LICENSE 为准，打包程序保留 Electron/Chromium 的许可证文件与相关依赖文件。

FFmpeg/FFprobe 未捆绑在交付包内；若服务电脑安装了它们，后台会尝试生成视频封面并读取时长。缺少时仍保留原文件，使用格式标识展示，播放器能力按实际编码验证。

此仓库公开项目源码以便查看与维护。项目自身代码尚未授予开源许可；第三方代码继续遵循各自许可，不能将整个项目视作无附加条件的 MIT 软件。
