// ErrorBoundary - Catches React component errors and shows fallback UI
import React, { Component, ReactNode } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    BackHandler,
} from 'react-native';
import { analytics } from '../services/analyticsService';
import i18n from '../i18n';

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onGoBack?: () => void; // Navigation callback to go back safely
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        // Update state so next render shows fallback UI
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        // Log the error to analytics/crash reporting
        this.setState({ errorInfo });

        // Log to our analytics service (forwards to Sentry when configured)
        analytics.logError(error, 'ErrorBoundary', {
            componentStack: errorInfo.componentStack,
        });

        // Log detailed info for debugging (development only)
        if (__DEV__) {
            console.error('[ErrorBoundary] Caught error:', error);
            console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
        }
    }

    handleRetry = (): void => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    handleGoBack = (): void => {
        // If onGoBack is provided, use it for safe navigation
        if (this.props.onGoBack) {
            this.props.onGoBack();
        } else {
            // Fallback: use Android back handler
            BackHandler.exitApp();
        }
    };

    render(): ReactNode {
        if (this.state.hasError) {
            // Custom fallback if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default error fallback UI
            return (
                <SafeAreaView style={styles.container}>
                    <View style={styles.content}>
                        <Text style={styles.emoji}>😵</Text>
                        <Text style={styles.title}>{i18n.t('error_boundary.title')}</Text>
                        <Text style={styles.subtitle}>
                            {i18n.t('error_boundary.subtitle')}
                        </Text>

                        {__DEV__ && this.state.error && (
                            <ScrollView style={styles.errorContainer}>
                                <Text style={styles.errorTitle}>{i18n.t('error_boundary.details')}</Text>
                                <Text style={styles.errorText}>
                                    {this.state.error.toString()}
                                </Text>
                                {this.state.errorInfo && (
                                    <Text style={styles.stackText}>
                                        {this.state.errorInfo.componentStack}
                                    </Text>
                                )}
                            </ScrollView>
                        )}

                        {/* Go Back button - SAFEST option to avoid navigation issues */}
                        <TouchableOpacity style={styles.goBackButton} onPress={this.handleGoBack}>
                            <Text style={styles.goBackButtonText}>{i18n.t('error_boundary.go_back')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
                            <Text style={styles.retryButtonText}>{i18n.t('error_boundary.try_again')}</Text>
                        </TouchableOpacity>

                        <Text style={styles.helpText}>
                            {i18n.t('error_boundary.help')}
                        </Text>
                    </View>
                </SafeAreaView>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#020617',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    emoji: {
        fontSize: 64,
        marginBottom: 24,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        marginBottom: 32,
        lineHeight: 24,
        paddingHorizontal: 16,
    },
    errorContainer: {
        maxHeight: 200,
        width: '100%',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.3)',
    },
    errorTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ef4444',
        marginBottom: 8,
    },
    errorText: {
        fontSize: 12,
        color: '#fca5a5',
        fontFamily: 'monospace',
        marginBottom: 8,
    },
    stackText: {
        fontSize: 10,
        color: 'rgba(252, 165, 165, 0.7)',
        fontFamily: 'monospace',
    },
    goBackButton: {
        backgroundColor: '#334155',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    goBackButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
    },
    retryButton: {
        backgroundColor: '#8b5cf6',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 16,
        marginBottom: 24,
    },
    retryButtonText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
    },
    helpText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.4)',
        textAlign: 'center',
    },
});

export default ErrorBoundary;
