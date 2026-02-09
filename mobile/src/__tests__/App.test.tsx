import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

describe('App Smoke Test', () => {
    it('renders text correctly', () => {
        render(<Text>Hello Jest</Text>);
        expect(screen.getByText('Hello Jest')).toBeTruthy();
    });
});
