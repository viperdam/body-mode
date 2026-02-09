#!/usr/bin/env node
/**
 * Pre-Build Validation Script
 * Checks for common issues before building the app
 */

const fs = require('fs');
const path = require('path');

const errors = [];
const warnings = [];

console.log('🔍 Running pre-build validation...\n');

// 1. Check environment variables
console.log('📝 Checking environment variables...');
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  errors.push('.env file not found. Create one with EXPO_PUBLIC_GEMINI_API_KEY');
} else {
  const envContent = fs.readFileSync(envPath, 'utf8');
  if (!envContent.includes('EXPO_PUBLIC_GEMINI_API_KEY')) {
    errors.push('.env missing EXPO_PUBLIC_GEMINI_API_KEY');
  } else if (envContent.includes('your_api_key_here') || envContent.includes('AIzaSy_PLACEHOLDER')) {
    warnings.push('Gemini API key appears to be a placeholder. Replace with real key.');
  }
}

// 2. Check app.json configuration
console.log('⚙️  Checking app.json...');
const appJsonPath = path.join(__dirname, '..', 'app.json');
if (!fs.existsSync(appJsonPath)) {
  errors.push('app.json not found');
} else {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  if (!appJson.expo.name) {
    errors.push('app.json missing expo.name');
  }

  if (!appJson.expo.version) {
    warnings.push('app.json missing version number');
  }

  if (appJson.expo.ios && !appJson.expo.ios.bundleIdentifier) {
    warnings.push('iOS bundleIdentifier not set');
  }

  if (appJson.expo.android && !appJson.expo.android.package) {
    warnings.push('Android package name not set');
  }

  // Check for test AdMob IDs in production
  const plugins = appJson.expo.plugins || [];
  const admobPlugin = plugins.find(p => Array.isArray(p) && p[0] === 'react-native-google-mobile-ads');
  if (admobPlugin) {
    const config = admobPlugin[1];
    if (config.androidAppId && config.androidAppId.includes('3940256099942544')) {
      warnings.push('Using test AdMob ID for Android. Replace with production ID for release.');
    }
    if (config.iosAppId && config.iosAppId.includes('3940256099942544')) {
      warnings.push('Using test AdMob ID for iOS. Replace with production ID for release.');
    }
  }
}

// 3. Check package.json
console.log('📦 Checking package.json...');
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  errors.push('package.json not found');
} else {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (!packageJson.version) {
    warnings.push('package.json missing version number');
  }

  if (!packageJson.name) {
    errors.push('package.json missing name');
  }

  // Check for required dependencies
  const requiredDeps = [
    'expo',
    'react',
    'react-native',
    '@react-navigation/native',
    '@google/genai',
  ];

  requiredDeps.forEach(dep => {
    if (!packageJson.dependencies[dep]) {
      errors.push(`Missing required dependency: ${dep}`);
    }
  });
}

// 4. Check TypeScript configuration
console.log('🔧 Checking TypeScript config...');
const tsconfigPath = path.join(__dirname, '..', 'tsconfig.json');
if (!fs.existsSync(tsconfigPath)) {
  warnings.push('tsconfig.json not found');
}

// 5. Check for common file structure issues
console.log('📁 Checking file structure...');
const requiredDirs = [
  'src',
  'src/screens',
  'src/services',
  'src/components',
  'src/contexts',
  'src/navigation',
];

requiredDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    errors.push(`Required directory missing: ${dir}`);
  }
});

// 6. Check for large files that might slow down build
console.log('📊 Checking for large files...');
function checkDirectorySize(dir, maxSize = 1024 * 1024) { // 1MB default
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isFile() && stats.size > maxSize) {
      warnings.push(`Large file detected: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
    }
  });
}

checkDirectorySize(path.join(__dirname, '..', 'src'));
checkDirectorySize(path.join(__dirname, '..', 'assets'));

// 7. Report results
console.log('\n' + '='.repeat(50));
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All checks passed! Ready to build.');
  process.exit(0);
}

if (warnings.length > 0) {
  console.log(`\n⚠️  ${warnings.length} Warning(s):`);
  warnings.forEach((warning, index) => {
    console.log(`  ${index + 1}. ${warning}`);
  });
}

if (errors.length > 0) {
  console.log(`\n❌ ${errors.length} Error(s):`);
  errors.forEach((error, index) => {
    console.log(`  ${index + 1}. ${error}`);
  });
  console.log('\n🛑 Fix errors before building.');
  process.exit(1);
}

console.log('\n✅ No critical errors. You can proceed with caution.');
process.exit(0);
